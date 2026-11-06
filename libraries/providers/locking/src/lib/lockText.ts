import { lockDate, parseLockInfo, withoutSeconds } from "./lockInfo";
import type { Lock } from "./types";

// rows without a client part are written by the Java app
export const clientLabel = (lock: Lock) =>
  parseLockInfo(lock.info)?.client ?? "Java-Anwendung";

// for "in …": "in Chrome", "in der Java-Anwendung", "in der Web-Anwendung"
export const clientOf = (lock: Lock) => {
  const label = clientLabel(lock);
  return label.endsWith("Anwendung") ? `der ${label}` : label;
};

export const isJavaLock = (lock: Lock) => !parseLockInfo(lock.info)?.client;

export const sinceOf = (lock: Lock) => {
  const time = parseLockInfo(lock.info)?.time;
  return time ? withoutSeconds(time) : undefined;
};

// "in der Web-Anwendung seit 2.11.2026, 13:49"
export const lockWhere = (lock: Lock) => {
  const since = sinceOf(lock);
  return [`in ${clientOf(lock)}`, since && `seit ${since}`]
    .filter(Boolean)
    .join(" ");
};

// "Gesperrt von cismet in der Web-Anwendung seit 2.11.2026, 13:49"
export const lockSentence = (lock: Lock, own = false) =>
  own
    ? `Von Ihnen gesperrt ${lockWhere(lock)}`
    : `Gesperrt von ${lock.userString} ${lockWhere(lock)}`;

export const lockRows = (lock: Lock, showUser: boolean) => {
  const since = sinceOf(lock);
  return [
    ...(showUser
      ? [{ key: "user", label: "Gesperrt von", value: lock.userString }]
      : []),
    { key: "client", label: "Gesperrt in", value: clientLabel(lock) },
    ...(since ? [{ key: "since", label: "Gesperrt seit", value: since }] : []),
  ];
};

// ISO → "2.11.2026, 13:49", like the lock times
export const formatSavedAt = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export const isStaleLock = (lock: Lock, hours: number) => {
  const time = parseLockInfo(lock.info)?.time;
  const date = time ? lockDate(time) : undefined;
  return date ? Date.now() - date.getTime() > hours * 3_600_000 : false;
};

export const takeOverWarning = (lock: Lock, staleAfterHours: number) => {
  if (isJavaLock(lock)) {
    return {
      type: "error" as const,
      message: "Die Java-Anwendung kann Ihre Änderungen überschreiben",
      description:
        "Sie prüft ihre Sperre beim Speichern nicht. Beenden Sie dort zuerst die Bearbeitung.",
    };
  }
  if (isStaleLock(lock, staleAfterHours)) {
    return {
      type: "info" as const,
      message: `Die Sperre ist älter als ${String(staleAfterHours)} Stunden`,
      description: `Die Bearbeitung in ${clientOf(
        lock
      )} wurde wahrscheinlich nicht beendet.`,
    };
  }
  return {
    type: "warning" as const,
    message: `Ungespeicherte Änderungen in ${clientOf(lock)} gehen verloren`,
    description: "Dort kann danach nicht mehr gespeichert werden.",
  };
};
