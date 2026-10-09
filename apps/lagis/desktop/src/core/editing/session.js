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
  checkRowLocks,
  releaseLock,
  releaseLocksOnUnload,
  releaseOwnLocks,
  releaseLocks,
} from "./locks";
import { createJournal, describeRollbackFailures } from "./journal";
import {
  DraftValidationError,
  MIPA_RULES,
  REBE_RULES,
  findAdminProblems,
  findUsageProblems,
} from "./validation";
import {
  editEnded,
  editStarted,
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

// Java locks every MiPa and ReBe too: one can lie on several parcels
const acquireRowLocks = async (rows, acquire, ctx) => {
  const locks = [];
  try {
    for (const row of rows ?? []) {
      locks.push(await acquire(row, ctx));
    }
  } catch (error) {
    await releaseLocks(locks, ctx.jwt);
    throw error;
  }
  return locks;
};

// returns { mipaLocks, rebeLocks }, or holds none of them on failure
const acquireSectionLocks = async (sections, ctx) => {
  // all conflicts in one message, before any row is locked
  await checkRowLocks(
    { mipas: sections?.mipa?.mipas, rebes: sections?.rebe?.rebes },
    ctx
  );
  const mipaLocks = await acquireRowLocks(
    sections?.mipa?.mipas,
    acquireMipaLock,
    ctx
  );
  try {
    const rebeLocks = await acquireRowLocks(
      sections?.rebe?.rebes,
      acquireRebeLock,
      ctx
    );
    return { mipaLocks, rebeLocks };
  } catch (error) {
    await releaseLocks(mipaLocks, ctx.jwt);
    throw error;
  }
};

const releaseSectionLocks = async ({ mipaLocks, rebeLocks }, jwt) => {
  await releaseLocks(mipaLocks, jwt);
  await releaseLocks(rebeLocks, jwt);
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
    let lock;
    try {
      const key = cached?.key ?? (await loadKey(schluesselId, jwt));
      const label = formatKey(key);
      // lock before loading, so nobody can change the data in between
      lock = await acquireLock(schluesselId, {
        jwt,
        accountName,
        contextKeyString: label,
        keyString: label,
      });
      const sections =
        cached?.sections ?? (await loadSections(key, geometry, jwt));
      sectionCache = { schluesselId, landparcel, key, sections };
      const sectionLocks = await acquireSectionLocks(sections, {
        jwt,
        accountName,
        contextKeyString: label,
      });
      dispatch(
        editStarted({
          parcel: { schluesselId, label, key, urlParams },
          lock,
          ...sectionLocks,
          sections,
        })
      );
    } catch (error) {
      await releaseLock(lock, jwt);
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
  const problems = findDraftProblems(editing);
  if (problems.length) {
    throw new DraftValidationError(problems);
  }

  const { jwt, accountName } = context(getState);
  const { parcel, draft, original, lock } = editing;
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
  await releaseLock(lock, jwt);
  await releaseSectionLocks(editing, jwt);
  dispatch(editEnded());
};

export const discardEditing = () => async (dispatch, getState) => {
  const editing = getState().editing;
  const { jwt } = context(getState);
  await releaseLock(editing.lock, jwt);
  await releaseSectionLocks(editing, jwt);
  dispatch(editEnded());
};

// The tab closes or reloads: the draft is lost, the locks go with it.
export const endEditingOnUnload = () => (dispatch, getState) => {
  const { active, lock, mipaLocks, rebeLocks } = getState().editing;
  if (!active) {
    return;
  }
  releaseLocksOnUnload(
    [lock, ...(mipaLocks ?? []), ...(rebeLocks ?? [])],
    context(getState).jwt
  );
  dispatch(editEnded());
};

// TODO: remove with ClearLocksButton once stale locks no longer happen
// dev tool: also ends edit mode, since its locks are gone afterwards
export const clearOwnLocks = (locks) => async (dispatch, getState) => {
  const { jwt } = context(getState);
  const failed = await releaseOwnLocks(locks, jwt);
  if (getState().editing.active) {
    dispatch(editEnded());
  }
  return failed;
};

export const errorMessage = (error) => {
  if (error instanceof ActionNotSuccessfulError) {
    return error.message;
  }
  console.error(error);
  return "Ein unerwarteter Fehler ist aufgetreten. Bitte erneut versuchen. Wenn der Fehler bleibt, den Systemadministrator kontaktieren.";
};
