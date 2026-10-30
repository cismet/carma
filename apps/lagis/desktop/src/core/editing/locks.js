import {
  clientName,
  formatLockInfo,
  isOwnLock,
  lockTimestamp,
  parseLockInfo,
  toHeldLock,
  withoutSeconds,
} from "@carma-providers/locking";
import { ActionNotSuccessfulError, CLASS } from "../wizard/api";
import { cidsLockAdapter } from "./lockAdapter";

// "Vohwinkel 23 129/0" as stored → "Vohwinkel-23-129/0" as the header shows it
export const displayParcel = (label) => {
  const parts = (label ?? "").trim().split(/\s+/);
  return parts.length >= 3
    ? [parts.slice(0, -2).join(" "), ...parts.slice(-2)].join("-")
    : label;
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
  const parsed = parseLockInfo(info);
  const lockedFrom = parsed && displayParcel(parsed.context);
  const since = parsed && withoutSeconds(parsed.time);
  const client = parsed?.client;
  return [
    lockedFrom && lockedFrom !== displayParcel(parcel)
      ? `über Flurstück ${lockedFrom}`
      : undefined,
    // non-breaking spaces keep "seit 9.10.2026, 11:22" on one line
    since ? `seit\u00A0${since.replace(/,\s*/, ",\u00A0")}` : undefined,
    client ? `in\u00A0${client}` : undefined,
  ].filter(Boolean);
};

// Fixed lines (object / who / details), so "wird" never ends the first line.
const holderSentence = (lock, object, parcel) => {
  const details = conflictDetails(lock.info, parcel);
  return [
    capitalize(object.withArticle),
    `wird gerade von ${lock.userString} bearbeitet${details.length ? "" : "."}`,
    details.length ? `(${details.join(", ")}).` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
};

const detailsText = (info, parcel) => {
  const details = conflictDetails(info, parcel);
  return details.length ? ` (${details.join(", ")})` : "";
};

const ownSentence = (lock, object, parcel) =>
  [
    capitalize(object.withArticle),
    `ist von Ihnen gesperrt${detailsText(lock.info, parcel)}.`,
    ...(lock.history.length
      ? [
          "Frühere Sperren:",
          ...lock.history.map(
            (old) =>
              `• ${
                conflictDetails(old.info, parcel).join(", ") || "ohne Angabe"
              }`
          ),
        ]
      : []),
  ].join("\n");

const describeConflict = (lock, object, parcel, accountName) => {
  const own = isOwnLock(lock, accountName);
  return {
    text: own
      ? ownSentence(lock, object, parcel)
      : holderSentence(lock, object, parcel),
    line: `• ${object.label} — ${[
      own ? "von Ihnen" : lock.userString,
      ...conflictDetails(lock.info, parcel),
    ].join(", ")}`,
  };
};

// Any lock blocks, also one of the same user left by a closed tab: as in
// Java, there is no take-over.
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

const findObjectLock = async (className, objectId, jwt) =>
  objectId
    ? toHeldLock(
        await cidsLockAdapter(jwt).listForObject({
          type: className,
          id: objectId,
        })
      )
    : undefined;

export const findLock = (schluesselId, jwt) =>
  findObjectLock(CLASS.SCHLUESSEL, schluesselId, jwt);

export const parcelLockedError = (lock, keyString, accountName) =>
  new LockConflictError([
    describeConflict(lock, parcelObject(keyString), keyString, accountName),
  ]);

// info follows the Java client
const acquireObjectLock = async (
  className,
  objectId,
  { jwt, accountName, info, object, parcel }
) => {
  const existing = await findObjectLock(className, objectId, jwt);
  if (existing) {
    throw new LockConflictError([
      describeConflict(existing, object, parcel, accountName),
    ]);
  }
  try {
    return await cidsLockAdapter(jwt).write(
      { type: className, id: objectId },
      accountName,
      formatLockInfo({
        ...info,
        time: lockTimestamp(),
        client: clientName(),
      })
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
    info: { context: contextKeyString ?? "-", object: "-" },
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
    info: {
      context: contextKeyString,
      object: `Vermietung/Verpachtung: ${mipaName(mipa)}`,
    },
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
    info: {
      context: contextKeyString,
      object: `Recht/Belastung: ${rebeName(rebe)}`,
    },
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
  const locks = await cidsLockAdapter(ctx.jwt).listForObjects(className, ids);
  const locksByObject = new Map();
  for (const lock of locks) {
    locksByObject.set(lock.objectId, [
      ...(locksByObject.get(lock.objectId) ?? []),
      lock,
    ]);
  }
  return [...locksByObject].map(([objectId, objectLocks]) =>
    describeConflict(
      toHeldLock(objectLocks),
      objectOf(rows.find((candidate) => Number(idOf(candidate)) === objectId)),
      ctx.contextKeyString,
      ctx.accountName
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
    await cidsLockAdapter(jwt).remove(lock.id);
  } catch (e) {
    // best effort, as in Swing: don't mask the action's real error
    console.error("Sperre konnte nicht gelöst werden", e);
  }
};

// all at once: one by one takes seconds on parcels with many MiPa
export const releaseLocks = async (locks, jwt) => {
  await Promise.all((locks ?? []).map((lock) => releaseLock(lock, jwt)));
};

export const findOwnLocks = (accountName, jwt) =>
  cidsLockAdapter(jwt).listByUser(accountName);

// dev tool: frees every lock of this user, also ones left by broken sessions
export const releaseOwnLocks = async (locks, jwt) => {
  const adapter = cidsLockAdapter(jwt);
  const results = await Promise.allSettled(
    locks.map((lock) => adapter.remove(lock.id))
  );
  return results.filter((result) => result.status === "rejected").length;
};
