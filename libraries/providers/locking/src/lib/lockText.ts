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

// "Chrome: 2.11.2026, 13:49"
export const lockLine = (lock: Lock) =>
  [clientLabel(lock), sinceOf(lock)].filter(Boolean).join(": ");

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
