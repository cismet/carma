import wizardQueries from "./queries";
import { run, ActionNotSuccessfulError } from "./api";

/**
 * Port of the Sperre handling in LagisBroker (isLocked / createLock /
 * releaseLock). Reads go against the `sperre` view, writes against `cs_locks` —
 * the same split the Swing client uses.
 */

const SCHLUESSEL_TABLE = "flurstueck_schluessel";

let cachedClassId;

const fetchSchluesselClassId = async (jwt) => {
  if (cachedClassId !== undefined) {
    return cachedClassId;
  }
  const data = await run(
    wizardQueries.classIdForTable,
    { tableName: SCHLUESSEL_TABLE },
    jwt
  );
  const row = (data.cs_class ?? [])[0];
  if (!row) {
    throw new ActionNotSuccessfulError(
      "Die Klasse flurstueck_schluessel konnte auf dem Server nicht gefunden werden."
    );
  }
  cachedClassId = row.id;
  return cachedClassId;
};

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
  const classId = await fetchSchluesselClassId(jwt);
  const data = await run(
    wizardQueries.insertLock,
    {
      object: {
        class_id: classId,
        object_id: schluesselId,
        user_string: accountName,
        additional_info: formatInfo(contextKeyString),
      },
    },
    jwt
  );
  const id = data.insert_cs_locks_one?.id;
  if (!id) {
    throw new ActionNotSuccessfulError(
      `Anlegen einer Sperre für das Flurstück ${keyString} nicht möglich.`
    );
  }
  return { id, schluesselId };
};

export const releaseLock = async (lock, jwt) => {
  if (!lock?.id) {
    return;
  }
  try {
    await run(wizardQueries.deleteLock, { id: lock.id }, jwt);
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
