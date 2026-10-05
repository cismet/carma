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
import { acquireLock, findLock, releaseLock } from "./locks";
import { createJournal, describeRollbackFailures } from "./journal";
import {
  draftReloaded,
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

// Verwaltungsbereiche exist only for städtische parcels
const loadSections = async (schluesselId, jwt) => {
  const key = await fetchSchluesselById(schluesselId, jwt);
  if (!key) {
    throw new ActionNotSuccessfulError("Das Flurstück wurde nicht gefunden.");
  }
  const admin = isStaedtischKey(key)
    ? {
        ...toParcelData(await fetchAdminData(key.id, jwt), undefined, {
          withGeometry: true,
        }),
        sperre: key.istGesperrt,
        sperreBemerkung: key.bemerkungSperre,
      }
    : undefined;
  return { key, sections: { admin } };
};

export const startEditing =
  ({ schluesselId, urlParams }) =>
  async (dispatch, getState) => {
    const { jwt, accountName } = context(getState);
    dispatch(setEditStatus("starting"));
    let lock;
    try {
      const { key, sections } = await loadSections(schluesselId, jwt);
      const label = formatKey(key);
      lock = await acquireLock(schluesselId, {
        jwt,
        accountName,
        contextKeyString: label,
        keyString: label,
      });
      dispatch(
        editStarted({
          parcel: { schluesselId, label, key, urlParams },
          lock,
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

// GraphQL writes aren't transactional: the journal undoes them on failure
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
  const { parcel, draft } = editing;
  const journal = createJournal();
  dispatch(setEditStatus("saving"));
  try {
    if (draft.admin) {
      await saveAdminData(
        [parcel.key],
        { [parcel.label]: draft.admin },
        { jwt, accountName, journal }
      );
    }
    journal.commit();
    const { sections } = await loadSections(parcel.schluesselId, jwt);
    dispatch(draftReloaded(sections));
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
};

export const discardEditing = () => async (dispatch, getState) => {
  const { lock, lockHolder } = getState().editing;
  // a lock taken over by someone else is no longer ours to release
  if (!lockHolder) {
    await releaseLock(lock, context(getState).jwt);
  }
  dispatch(editEnded());
};

export const stopEditing =
  ({ save }) =>
  async (dispatch) => {
    if (save) {
      await dispatch(saveEditing());
    }
    await dispatch(discardEditing());
  };

// after a reload the persisted lock may be gone or taken over
export const verifyEditLock = () => async (dispatch, getState) => {
  const { active, parcel, lock } = getState().editing;
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
  dispatch(
    lockRenewed(
      await acquireLock(parcel.schluesselId, {
        jwt,
        accountName,
        contextKeyString: parcel.label,
        keyString: parcel.label,
      })
    )
  );
};

export const errorMessage = (error) =>
  error instanceof ActionNotSuccessfulError
    ? error.message
    : "Unbekannter Fehler. Bitte wenden Sie sich an Ihren Systemadministrator.";
