import {
  ActionNotSuccessfulError,
  fetchAdminData,
  fetchSchluesselById,
} from "../wizard/api";
import { isStaedtischKey, toParcelData } from "../wizard/adminData";
import { saveAdminData } from "../wizard/operations/admin";
import { formatKey } from "../wizard/keys";
import { loadUsageSection, saveUsageEdit } from "./usage";
import { loadMipaSection, saveMipaEdit } from "./mipa";
import { loadRebeSection, saveRebeEdit } from "./rebe";
import {
  acquireLock,
  acquireMipaLock,
  acquireRebeLock,
  deleteLockById,
  findLock,
  findOwnLocks,
  releaseOwnLocks,
} from "./locks";
import {
  forget,
  matchesRow,
  noteCreated,
  noteIds,
  notePending,
  sweepableEntries,
} from "./lockRegistry";
import { createJournal, describeRollbackFailures } from "./journal";
import {
  DraftValidationError,
  MIPA_RULES,
  REBE_RULES,
  findAdminProblems,
  findUsageProblems,
} from "./validation";
import {
  activeLockIds,
  editEnded,
  editStarted,
  lockLost,
  lockRenewed,
  setEditStatus,
} from "../../store/slices/editing";

const context = (getState) => ({
  jwt: getState().auth.jwt,
  accountName: getState().auth.login,
});

const loadKey = async (schluesselId, jwt) => {
  const key = await fetchSchluesselById(schluesselId, jwt);
  if (!key) {
    throw new ActionNotSuccessfulError("Das Flurstück wurde nicht gefunden.");
  }
  return key;
};

// Verwaltungsbereiche, Nutzungen and MiPa are editable only on städtische
// parcels, ReBe on every parcel
const loadSections = async (key, parcelGeometry, jwt) => {
  if (!isStaedtischKey(key)) {
    return { rebe: await loadRebeSection(key, parcelGeometry, jwt) };
  }
  const [adminData, usage, mipa, rebe] = await Promise.all([
    fetchAdminData(key.id, jwt),
    loadUsageSection(key, jwt),
    loadMipaSection(parcelGeometry, jwt),
    loadRebeSection(key, parcelGeometry, jwt),
  ]);
  const admin = {
    ...toParcelData(adminData, undefined, { withGeometry: true }),
    sperre: key.istGesperrt,
    sperreBemerkung: key.bemerkungSperre,
  };
  return { admin, usage, mipa, rebe };
};

// Toggling edit on again reuses the loaded data. It's only valid while the
// view shows the same parcel load: a reload (e.g. after save) or another
// parcel replaces lagisLandparcel and so drops it.
let sectionCache;

const cachedFor = (schluesselId, landparcel) =>
  sectionCache?.schluesselId === schluesselId &&
  sectionCache.landparcel === landparcel
    ? sectionCache
    : undefined;

const track = {
  pending: (row) =>
    notePending({
      user: row.user_string,
      classId: row.class_id,
      objectId: row.object_id,
      info: row.additional_info,
    }),
  created: noteCreated,
};

// Java locks every MiPa and ReBe too: one can lie on several parcels
const acquireRowLocks = async (rows, acquire, ctx) => {
  const locks = [];
  for (const row of rows ?? []) {
    locks.push(await acquire(row, ctx));
  }
  return locks;
};

const acquireSectionLocks = async (sections, ctx) => ({
  mipaLocks: await acquireRowLocks(sections?.mipa?.mipas, acquireMipaLock, ctx),
  rebeLocks: await acquireRowLocks(sections?.rebe?.rebes, acquireRebeLock, ctx),
});

// Deletes every registered lock the active session doesn't use. What can't
// be deleted (no JWT, network, server) stays registered for the next run.
const sweep = async (getState) => {
  const { jwt, accountName } = context(getState);
  if (!jwt) {
    return;
  }
  const inUse = new Set(activeLockIds(getState().editing));
  try {
    const entries = (await sweepableEntries(accountName)).filter(
      (entry) => !inUse.has(entry.id)
    );
    if (!entries.length) {
      return;
    }
    const rows = await findOwnLocks(accountName, jwt);
    const results = await Promise.allSettled(
      entries.map(async (entry) => {
        const row = rows.find((candidate) => matchesRow(entry, candidate));
        // no row: already gone, or the create never reached the server
        if (row && !inUse.has(row.id)) {
          await deleteLockById(row.id, jwt);
        }
      })
    );
    results
      .filter((result) => result.status === "rejected")
      .forEach((result) =>
        console.error("Sperre konnte nicht gelöst werden", result.reason)
      );
    forget(
      entries
        .filter((_, i) => results[i].status === "fulfilled")
        .map((entry) => entry.key)
    );
  } catch (error) {
    console.error("Sperren konnten nicht geprüft werden", error);
  }
};

// one at a time, so a sweep never runs while this tab creates locks
let sweeping = Promise.resolve();
const sweepStaleLocks = (getState) => {
  sweeping = sweeping.then(() => sweep(getState));
  return sweeping;
};

// sessions persisted before the registry existed know their locks only in redux
const endSession = async (dispatch, getState) => {
  noteIds(activeLockIds(getState().editing), context(getState).accountName);
  dispatch(editEnded());
  await sweepStaleLocks(getState);
};

// a running start or save owns its locks, so the sweep waits for idle
export const releaseStaleLocks = () => async (dispatch, getState) => {
  if (getState().editing.status !== "idle") {
    return;
  }
  await sweepStaleLocks(getState);
};

export const startEditing =
  ({ schluesselId, urlParams }) =>
  async (dispatch, getState) => {
    // a double click must not take two locks
    const { active, status } = getState().editing;
    if (active || status !== "idle") {
      return;
    }
    const { jwt, accountName } = context(getState);
    dispatch(setEditStatus("starting"));
    const { lagisLandparcel: landparcel, geometry } = getState().lagis;
    const cached = cachedFor(schluesselId, landparcel);
    try {
      // leftovers of earlier sessions would block our own objects
      await sweepStaleLocks(getState);
      const key = cached?.key ?? (await loadKey(schluesselId, jwt));
      const label = formatKey(key);
      const ctx = { jwt, accountName, track, contextKeyString: label };
      // lock before loading, so nobody can change the data in between
      const lock = await acquireLock(schluesselId, {
        ...ctx,
        keyString: label,
      });
      const sections =
        cached?.sections ?? (await loadSections(key, geometry, jwt));
      sectionCache = { schluesselId, landparcel, key, sections };
      const sectionLocks = await acquireSectionLocks(sections, ctx);
      dispatch(
        editStarted({
          parcel: { schluesselId, label, key, urlParams },
          lock,
          ...sectionLocks,
          sections,
        })
      );
    } catch (error) {
      // not active yet, so this frees every lock taken above
      await sweepStaleLocks(getState);
      throw error;
    } finally {
      dispatch(setEditStatus("idle"));
    }
  };

const SECTION_LABELS = {
  admin: "Verwaltungsbereiche",
  usage: "Nutzungen",
  mipa: "Vermietungen und Verpachtungen",
  rebe: "Rechte und Belastungen",
};

// all problems of all sections: [{ title, items: [{ name?, text }] }]
export const findDraftProblems = (editing) => {
  const { draft, original } = editing;
  const checks = [
    ["admin", () => findAdminProblems(draft.admin)],
    ["usage", () => findUsageProblems(original.usage, draft.usage)],
    ["mipa", () => MIPA_RULES.findProblems(original.mipa, draft.mipa)],
    ["rebe", () => REBE_RULES.findProblems(original.rebe, draft.rebe)],
  ];
  return checks
    .map(([section, check]) => ({
      title: SECTION_LABELS[section],
      items: draft?.[section] ? check() : [],
    }))
    .filter(({ items }) => items.length);
};

// names the section a server error came from
const saveSection = async (section, save) => {
  try {
    await save();
  } catch (error) {
    if (!(error instanceof ActionNotSuccessfulError)) {
      console.error(`Speichern der ${SECTION_LABELS[section]}`, error);
    }
    throw new ActionNotSuccessfulError(
      `Fehler beim Speichern der ${SECTION_LABELS[section]}: ${errorMessage(
        error
      )}`,
      error
    );
  }
};

// GraphQL writes aren't transactional: the journal undoes them on failure.
export const saveEditing = () => async (dispatch, getState) => {
  const editing = getState().editing;
  if (editing.lockHolder) {
    throw new ActionNotSuccessfulError(
      `Das Flurstück wird inzwischen von ${editing.lockHolder} bearbeitet.`
    );
  }
  const problems = findDraftProblems(editing);
  if (problems.length) {
    throw new DraftValidationError(problems);
  }

  const { jwt, accountName } = context(getState);
  const { parcel, draft, original } = editing;
  const journal = createJournal();
  sectionCache = undefined;
  dispatch(setEditStatus("saving"));
  try {
    if (draft.admin) {
      await saveSection("admin", () =>
        saveAdminData(
          [parcel.key],
          { [parcel.label]: draft.admin },
          { jwt, accountName, journal }
        )
      );
    }
    if (draft.usage) {
      await saveSection("usage", () =>
        saveUsageEdit(parcel, original.usage, draft.usage, {
          jwt,
          accountName,
          journal,
        })
      );
    }
    if (draft.mipa) {
      await saveSection("mipa", () =>
        saveMipaEdit(original.mipa, draft.mipa, { jwt, journal })
      );
    }
    if (draft.rebe) {
      await saveSection("rebe", () =>
        saveRebeEdit(original.rebe, draft.rebe, { jwt, journal })
      );
    }
    journal.commit();
  } catch (error) {
    if (journal.size === 0) {
      throw error;
    }
    const failed = await journal.rollback();
    throw new ActionNotSuccessfulError(
      [errorMessage(error), describeRollbackFailures(failed)].join("\n\n"),
      error
    );
  } finally {
    dispatch(setEditStatus("idle"));
  }
  await endSession(dispatch, getState);
};

// releases by id only, so a lock taken over by someone else stays untouched
export const discardEditing = () => async (dispatch, getState) => {
  await endSession(dispatch, getState);
};

// TODO: remove with ClearLocksButton once stale locks no longer happen
// dev tool: also ends edit mode, since its locks are gone afterwards
export const clearOwnLocks = (locks) => async (dispatch, getState) => {
  const { jwt } = context(getState);
  const failed = await releaseOwnLocks(locks, jwt);
  if (getState().editing.active) {
    dispatch(editEnded());
  }
  // forgets the locks deleted above
  await sweepStaleLocks(getState);
  return failed;
};

// after a reload the persisted lock may be gone or taken over
export const verifyEditLock = () => async (dispatch, getState) => {
  const editing = getState().editing;
  const { active, parcel, lock, original } = editing;
  if (!active) {
    return;
  }
  const { jwt, accountName } = context(getState);
  const existing = await findLock(parcel.schluesselId, jwt);
  if (existing?.id === lock?.id) {
    return;
  }
  if (existing) {
    dispatch(lockLost(existing.userString));
    return;
  }
  // the session's MiPa and ReBe locks may still exist and are reused; on
  // failure the next releaseStaleLocks frees what was taken here
  const ctx = {
    jwt,
    accountName,
    ownIds: activeLockIds(editing),
    track,
    contextKeyString: parcel.label,
  };
  const renewed = await acquireLock(parcel.schluesselId, {
    ...ctx,
    keyString: parcel.label,
  });
  const sectionLocks = await acquireSectionLocks(original, ctx);
  dispatch(lockRenewed({ lock: renewed, ...sectionLocks }));
};

export const errorMessage = (error) =>
  error instanceof ActionNotSuccessfulError
    ? error.message
    : "Unbekannter Fehler. Bitte wenden Sie sich an Ihren Systemadministrator.";
