import wizardQueries from "../wizard/queries";
import { run, ActionNotSuccessfulError, CLASS } from "../wizard/api";
import {
  deleteObject,
  fetchClassId,
  saveAndGetId,
} from "../wizard/cidsActions";

// "Vohwinkel 23 129/0" as stored → "Vohwinkel-23-129/0" as the header shows it
export const displayParcel = (label) => {
  const parts = (label ?? "").trim().split(/\s+/);
  return parts.length >= 3
    ? [parts.slice(0, -2).join(" "), ...parts.slice(-2)].join("-")
    : label;
};

// "9.10.2026, 11:22:55" → "9.10.2026, 11:22"
const withoutSeconds = (text) => text.replace(/(\d{1,2}:\d{2}):\d{2}$/, "$1");

// both clients write "<parcel>;<object or ->;<time>"; odd ones give {}
const parseInfo = (info) => {
  const parts = (info ?? "").split(";");
  return parts.length >= 3
    ? {
        parcel: displayParcel(parts[0]),
        since: withoutSeconds(parts[parts.length - 1].trim()),
      }
    : {};
};

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// object: { label, withArticle }, e.g. "Flurstück X" / "das Flurstück X"
const parcelObject = (keyString) => {
  const parcel = displayParcel(keyString);
  return {
    label: `Flurstück ${parcel}`,
    withArticle: `das Flurstück ${parcel}`,
  };
};

// as stored in additional_info, like Java
const mipaName = (mipa) => `${mipa.lage} (${mipa.aktenzeichen})`;
// for messages: an Aktenzeichen like "122 04 087" must not break apart
const mipaDisplayName = (mipa) =>
  `${mipa.lage} (${String(mipa.aktenzeichen ?? "").replace(/ /g, "\u00A0")})`;
const mipaObject = (mipa) => ({
  label: `Vermietung/Verpachtung ${mipaDisplayName(mipa)}`,
  withArticle: `die Vermietung/Verpachtung ${mipaDisplayName(mipa)}`,
});

const rebeName = (rebe) => `Nummer ${rebe.nummer}`;
const rebeObject = (rebe) => ({
  label: `Recht/Belastung ${rebeName(rebe)}`,
  withArticle: `das Recht/die Belastung ${rebeName(rebe)}`,
});

// "über" only when the lock was taken from another parcel
const conflictDetails = (info, parcel) => {
  const { parcel: lockedFrom, since } = parseInfo(info);
  return [
    lockedFrom && lockedFrom !== displayParcel(parcel)
      ? `über Flurstück ${lockedFrom}`
      : undefined,
    // non-breaking spaces keep "seit 9.10.2026, 11:22" on one line
    since ? `seit\u00A0${since.replace(/,\s*/, ",\u00A0")}` : undefined,
  ].filter(Boolean);
};

// One impersonal wording for every lock message, the holder always by name.
// Fixed lines (object / who / details), so "wird" never ends the first line.
// `when`: "gerade" before the start, "inzwischen" once the lock is lost.
const holderSentence = (lock, object, parcel, when) => {
  const details = conflictDetails(lock.info, parcel);
  return [
    capitalize(object.withArticle),
    `wird ${when} von ${lock.userString} bearbeitet${
      details.length ? "" : "."
    }`,
    details.length ? `(${details.join(", ")}).` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
};

// lock: { userString, info } of the lock that replaced ours
export const lockLostTexts = (parcelLabel, lock) => {
  const sentence = holderSentence(
    lock,
    parcelObject(parcelLabel),
    parcelLabel,
    "inzwischen"
  );
  return {
    warning: `${sentence}\nDie Änderungen können nicht mehr gespeichert werden. Zum Verwerfen den Bearbeitungsmodus beenden.`,
    saveBlocked: sentence,
  };
};

const describeConflict = (lock, object, parcel) => ({
  text: holderSentence(lock, object, parcel, "gerade"),
  line: `• ${object.label} — ${[
    lock.userString,
    ...conflictDetails(lock.info, parcel),
  ].join(", ")}`,
});

// one toast for one or many locked objects
export class LockConflictError extends ActionNotSuccessfulError {
  constructor(conflicts) {
    super(
      conflicts.length === 1
        ? conflicts[0].text
        : [
            "Gesperrte Objekte:",
            ...conflicts.map((conflict) => conflict.line),
          ].join("\n")
    );
    this.name = "LockConflictError";
  }
}

const toLock = (row) => ({
  id: row.id,
  userString: row.user_string,
  info: row.additional_info,
});

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
  return row ? toLock(row) : undefined;
};

export const findLock = (schluesselId, jwt) =>
  findObjectLock(CLASS.SCHLUESSEL, schluesselId, jwt);

const stamp = () => new Date().toLocaleString("de-DE");

// info follows the Java client
const acquireObjectLock = async (
  className,
  objectId,
  { jwt, accountName, info, object, parcel }
) => {
  const existing = await findObjectLock(className, objectId, jwt);
  if (existing) {
    throw new LockConflictError([describeConflict(existing, object, parcel)]);
  }
  const classId = await fetchClassId(className, jwt);
  try {
    return await saveAndGetId(
      CLASS.LOCK,
      {
        class_id: classId,
        object_id: objectId,
        user_string: accountName,
        additional_info: `${info};${stamp()}`,
      },
      jwt
    );
  } catch (e) {
    throw new ActionNotSuccessfulError(
      `Die Sperre für ${object.withArticle} konnte nicht angelegt werden. Bitte erneut versuchen.`,
      e
    );
  }
};

export const acquireLock = async (
  schluesselId,
  { jwt, accountName, contextKeyString, keyString }
) => {
  const id = await acquireObjectLock(CLASS.SCHLUESSEL, schluesselId, {
    jwt,
    accountName,
    info: `${contextKeyString ?? "-"};-`,
    object: parcelObject(keyString),
    parcel: keyString,
  });
  return { id, schluesselId };
};

export const acquireMipaLock = async (
  mipa,
  { jwt, accountName, contextKeyString }
) => {
  const id = await acquireObjectLock(CLASS.MIPA, mipa.mipaId, {
    jwt,
    accountName,
    info: `${contextKeyString};Vermietung/Verpachtung: ${mipaName(mipa)}`,
    object: mipaObject(mipa),
    parcel: contextKeyString,
  });
  return { id, mipaId: mipa.mipaId };
};

export const acquireRebeLock = async (
  rebe,
  { jwt, accountName, contextKeyString }
) => {
  const id = await acquireObjectLock(CLASS.REBE, rebe.rebeId, {
    jwt,
    accountName,
    info: `${contextKeyString};Recht/Belastung: ${rebeName(rebe)}`,
    object: rebeObject(rebe),
    parcel: contextKeyString,
  });
  return { id, rebeId: rebe.rebeId };
};

const rowConflicts = async (className, rows, idOf, objectOf, ctx) => {
  const ids = (rows ?? []).map(idOf).filter(Boolean);
  if (!ids.length) {
    return [];
  }
  const classId = await fetchClassId(className, ctx.jwt);
  const data = await run(
    wizardQueries.locksForObjects,
    { classId, objectIds: ids },
    ctx.jwt
  );
  return (data.cs_locks ?? []).map((row) =>
    describeConflict(
      toLock(row),
      objectOf(
        rows.find(
          (candidate) => Number(idOf(candidate)) === Number(row.object_id)
        )
      ),
      ctx.contextKeyString
    )
  );
};

// checks every MiPa and ReBe in one query each before any is locked, so the
// user sees all conflicts at once
export const checkRowLocks = async ({ mipas, rebes }, ctx) => {
  const conflicts = [
    ...(await rowConflicts(
      CLASS.MIPA,
      mipas,
      (m) => m.mipaId,
      mipaObject,
      ctx
    )),
    ...(await rowConflicts(
      CLASS.REBE,
      rebes,
      (r) => r.rebeId,
      rebeObject,
      ctx
    )),
  ];
  if (conflicts.length) {
    throw new LockConflictError(conflicts);
  }
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
    locks.map((lock) => deleteObject(CLASS.LOCK, { id: lock.id }, jwt))
  );
  return results.filter((result) => result.status === "rejected").length;
};
