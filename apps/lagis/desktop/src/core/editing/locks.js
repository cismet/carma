import wizardQueries from "../wizard/queries";
import { run, ActionNotSuccessfulError, CLASS } from "../wizard/api";
import {
  deleteObject,
  fetchClassId,
  saveAndGetId,
} from "../wizard/cidsActions";

const findObjectLock = async (className, objectId, jwt) => {
  if (!objectId) {
    return undefined;
  }
  const classId = await fetchClassId(className, jwt);
  const data = await run(
    wizardQueries.lockForObject,
    { classId, objectId },
    jwt
  );
  const row = (data.cs_locks ?? [])[0];
  return row
    ? { id: row.id, userString: row.user_string, info: row.additional_info }
    : undefined;
};

export const findLock = (schluesselId, jwt) =>
  findObjectLock(CLASS.SCHLUESSEL, schluesselId, jwt);

const stamp = () => new Date().toLocaleString("de-DE");

// info and messages follow the Java client. `track` ({ pending, created })
// lets the edit session note the lock before the server creates it.
const acquireObjectLock = async (
  className,
  objectId,
  { jwt, accountName, ownIds, track, info, lockedMessage, failedMessage }
) => {
  const existing = await findObjectLock(className, objectId, jwt);
  // a lock of the restored edit session is still ours
  if (existing && ownIds?.includes(existing.id)) {
    return existing.id;
  }
  if (existing) {
    throw new ActionNotSuccessfulError(lockedMessage(existing.userString));
  }
  const classId = await fetchClassId(className, jwt);
  const row = {
    class_id: classId,
    object_id: objectId,
    user_string: accountName,
    additional_info: `${info};${stamp()}`,
  };
  const trackKey = track?.pending(row);
  try {
    const id = await saveAndGetId(CLASS.LOCK, row, jwt);
    track?.created(trackKey, id);
    return id;
  } catch (e) {
    throw new ActionNotSuccessfulError(failedMessage, e);
  }
};

export const acquireLock = async (
  schluesselId,
  { jwt, accountName, ownIds, track, contextKeyString, keyString }
) => {
  const id = await acquireObjectLock(CLASS.SCHLUESSEL, schluesselId, {
    jwt,
    accountName,
    ownIds,
    track,
    info: `${contextKeyString ?? "-"};-`,
    lockedMessage: (holder) =>
      `Es existiert bereits eine Sperre für das Flurstück ${keyString} und wird von dem Benutzer ${holder} gehalten.`,
    failedMessage: `Anlegen einer Sperre für das Flurstück ${keyString} nicht möglich.`,
  });
  return { id, schluesselId };
};

export const acquireMipaLock = async (
  mipa,
  { jwt, accountName, ownIds, track, contextKeyString }
) => {
  const name = `${mipa.lage} (${mipa.aktenzeichen})`;
  const id = await acquireObjectLock(CLASS.MIPA, mipa.mipaId, {
    jwt,
    accountName,
    ownIds,
    track,
    info: `${contextKeyString};Vermietung/Verpachtung: ${name}`,
    lockedMessage: (holder) =>
      `Die Vermietung/Verpachtung ${name} wird von dem Benutzer ${holder} bearbeitet.`,
    failedMessage: `Anlegen einer Sperre für die Vermietung/Verpachtung ${name} nicht möglich.`,
  });
  return { id, mipaId: mipa.mipaId };
};

export const acquireRebeLock = async (
  rebe,
  { jwt, accountName, ownIds, track, contextKeyString }
) => {
  const name = `Nummer ${rebe.nummer}`;
  const id = await acquireObjectLock(CLASS.REBE, rebe.rebeId, {
    jwt,
    accountName,
    ownIds,
    track,
    info: `${contextKeyString};Recht/Belastung: ${name}`,
    lockedMessage: (holder) =>
      `Das Recht/die Belastung ${name} wird von dem Benutzer ${holder} bearbeitet.`,
    failedMessage: `Anlegen einer Sperre für das Recht/die Belastung ${name} nicht möglich.`,
  });
  return { id, rebeId: rebe.rebeId };
};

export const releaseLock = async (lock, jwt) => {
  if (!lock?.id) {
    return;
  }
  try {
    await deleteObject(CLASS.LOCK, { id: lock.id }, jwt);
  } catch (e) {
    // best effort, as in Swing: don't mask the action's real error
    console.error("Sperre konnte nicht gelöst werden", e);
  }
};

export const releaseLocks = async (locks, jwt) => {
  for (const lock of locks ?? []) {
    await releaseLock(lock, jwt);
  }
};

export const deleteLockById = (id, jwt) =>
  deleteObject(CLASS.LOCK, { id }, jwt);

export const findOwnLocks = async (accountName, jwt) => {
  const data = await run(
    wizardQueries.locksByUser,
    { userString: accountName },
    jwt
  );
  return data.cs_locks ?? [];
};

// dev tool: frees every lock of this user, also ones left by broken sessions
export const releaseOwnLocks = async (locks, jwt) => {
  const results = await Promise.allSettled(
    locks.map((lock) => deleteLockById(lock.id, jwt))
  );
  return results.filter((result) => result.status === "rejected").length;
};
