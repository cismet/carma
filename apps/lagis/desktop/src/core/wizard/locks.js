import wizardQueries from "./queries";
import { run, ActionNotSuccessfulError, CLASS } from "./api";
import { deleteObject, fetchClassId, saveAndGetId } from "./cidsActions";

/**
 * Port of the Sperre handling in LagisBroker (isLocked / createLock /
 * releaseLock). Reads go against the `sperre` view, writes against `cs_locks` —
 * the same split the Swing client uses. The write half goes through
 * SaveObject/DeleteObject like every other write.
 */

/** Returns the existing Sperre, or undefined when the key is free. */
export const findLock = async (schluesselId, jwt) => {
  if (!schluesselId) {
    return undefined;
  }
  const data = await run(
    wizardQueries.lockForSchluessel,
    { schluesselId },
    jwt
  );
  return (data.sperre ?? [])[0];
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
      `Es existiert bereits eine Sperre für das Flurstück ${keyString} und wird von dem Benutzer ${existing.user_string} gehalten.`
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
