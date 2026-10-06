import {
  ActionNotSuccessfulError,
  fetchAdminData,
  fetchSchluesselById,
} from "../wizard/api";
import {
  ADMIN_SECTION,
  findAdminProblem,
  isStaedtischKey,
  toParcelData,
} from "../wizard/adminData";
import { saveAdminData } from "../wizard/operations/admin";
import { formatKey } from "../wizard/keys";
import { loadUsageSection, saveUsageEdit } from "./usage";
import { loadMipaSection, saveMipaEdit } from "./mipa";
import { loadRebeSection, saveRebeEdit } from "./rebe";
import {
  acquireLock,
  acquireMipaLock,
  acquireRebeLock,
  findLock,
  releaseLock,
  releaseLocks,
} from "./locks";
import { createJournal, describeRollbackFailures } from "./journal";
import {
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

const ADMIN_CHECKS = [
  ADMIN_SECTION.DIENSTSTELLEN,
  ADMIN_SECTION.ROLLEN,
  ADMIN_SECTION.STRASSENFRONTEN,
];

export const findDraftProblem = (editing) => {
  const { draft, parcel } = editing;
  if (!draft?.admin) {
    return null;
  }
  const admin = { [parcel.label]: draft.admin };
  const targets = [{ key: parcel.key }];
  for (const section of ADMIN_CHECKS) {
    const problem = findAdminProblem(section, admin, targets);
    if (problem) {
      return problem;
    }
  }
  return null;
};

// GraphQL writes aren't transactional: the journal undoes them on failure.
// Like the Java client, a successful save ends edit mode and frees the lock.
export const saveEditing = () => async (dispatch, getState) => {
  const editing = getState().editing;
  if (editing.lockHolder) {
    throw new ActionNotSuccessfulError(
      `Das Flurstück wird inzwischen von ${editing.lockHolder} bearbeitet.`
    );
  }
  const problem = findDraftProblem(editing);
  if (problem) {
    throw new ActionNotSuccessfulError(problem);
  }

  const { jwt, accountName } = context(getState);
  const { parcel, draft, original, lock } = editing;
  const journal = createJournal();
  sectionCache = undefined;
  dispatch(setEditStatus("saving"));
  try {
    if (draft.admin) {
      await saveAdminData(
        [parcel.key],
        { [parcel.label]: draft.admin },
        { jwt, accountName, journal }
      );
    }
    if (draft.usage) {
      await saveUsageEdit(parcel, original.usage, draft.usage, {
        jwt,
        accountName,
        journal,
      });
    }
    if (draft.mipa) {
      await saveMipaEdit(original.mipa, draft.mipa, { jwt, journal });
    }
    if (draft.rebe) {
      await saveRebeEdit(original.rebe, draft.rebe, { jwt, journal });
    }
    journal.commit();
  } catch (error) {
    if (journal.size === 0) {
      throw error;
    }
    const failed = await journal.rollback();
    const reason =
      error instanceof ActionNotSuccessfulError
        ? error.message
        : "Unbekannter Fehler. Bitte wenden Sie sich an Ihren Systemadministrator.";
    throw new ActionNotSuccessfulError(
      [reason, describeRollbackFailures(failed)].join("\n\n"),
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
  // a lock taken over by someone else is no longer ours to release
  if (!editing.lockHolder) {
    const { jwt } = context(getState);
    await releaseLock(editing.lock, jwt);
    await releaseSectionLocks(editing, jwt);
  }
  dispatch(editEnded());
};

// after a reload the persisted lock may be gone or taken over
export const verifyEditLock = () => async (dispatch, getState) => {
  const { active, parcel, lock, original } = getState().editing;
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
  const renewed = await acquireLock(parcel.schluesselId, {
    jwt,
    accountName,
    contextKeyString: parcel.label,
    keyString: parcel.label,
  });
  let sectionLocks;
  try {
    sectionLocks = await acquireSectionLocks(original, {
      jwt,
      accountName,
      contextKeyString: parcel.label,
    });
  } catch (error) {
    await releaseLock(renewed, jwt);
    throw error;
  }
  dispatch(lockRenewed({ lock: renewed, ...sectionLocks }));
};

export const errorMessage = (error) =>
  error instanceof ActionNotSuccessfulError
    ? error.message
    : "Unbekannter Fehler. Bitte wenden Sie sich an Ihren Systemadministrator.";
