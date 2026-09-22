import wizardQueries from "./queries";
import { run, ActionNotSuccessfulError, CLASS } from "./api";
import { deleteObject, fetchClassId, saveAndGetId } from "./cidsActions";

/**
 * Port of the Sperre handling in LagisBroker (isLocked / createLock /
 * releaseLock). Both halves work on `cs_locks`: reads over GraphQL, writes
 * through SaveObject/DeleteObject like every other write.
 */

/** Returns the existing Sperre, or undefined when the key is free. */
export const findLock = async (schluesselId, jwt) => {
  if (!schluesselId) {
    return undefined;
  }
  const classId = await fetchClassId(CLASS.SCHLUESSEL, jwt);
  const data = await run(
    wizardQueries.lockForSchluessel,
    { classId, objectId: schluesselId },
    jwt
  );
  const row = (data.cs_locks ?? [])[0];
  return row
    ? { id: row.id, userString: row.user_string, info: row.additional_info }
    : undefined;
};

const formatInfo = (contextKeyString) => {
  const stamp = new Date().toLocaleString("de-DE");
  return `${contextKeyString ?? "-"};-;${stamp}`;
};

/**
 * Acquires a Sperre. Throws when somebody else already holds one, naming the
 * user — the wizard shows that message verbatim, as the Swing panels did.
 */
export const acquireLock = async (
  schluesselId,
  { jwt, accountName, contextKeyString, keyString }
) => {
  const existing = await findLock(schluesselId, jwt);
  if (existing) {
    throw new ActionNotSuccessfulError(
      `Es existiert bereits eine Sperre für das Flurstück ${keyString} und wird von dem Benutzer ${existing.userString} gehalten.`
    );
  }
  const classId = await fetchClassId(CLASS.SCHLUESSEL, jwt);
  let id;
  try {
    id = await saveAndGetId(
      CLASS.LOCK,
      {
        class_id: classId,
        object_id: schluesselId,
        user_string: accountName,
        additional_info: formatInfo(contextKeyString),
      },
      jwt
    );
  } catch (e) {
    throw new ActionNotSuccessfulError(
      `Anlegen einer Sperre für das Flurstück ${keyString} nicht möglich.`,
      e
    );
  }
  return { id, schluesselId };
};

export const releaseLock = async (lock, jwt) => {
  if (!lock?.id) {
    return;
  }
  try {
    await deleteObject(CLASS.LOCK, { id: lock.id }, jwt);
  } catch (e) {
    // Releasing is best effort: the Swing client also only logs this, and
    // failing here would mask the real error of the surrounding action.
    console.error("Sperre konnte nicht gelöst werden", e);
  }
};

export const releaseLocks = async (locks, jwt) => {
  for (const lock of locks ?? []) {
    await releaseLock(lock, jwt);
  }
};
