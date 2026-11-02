import { lockDate, parseLockInfo, withoutSeconds } from "./lockInfo";
import type { Lock } from "./types";

// rows without a client part are written by the Java app
export const clientLabel = (lock: Lock) =>
  parseLockInfo(lock.info)?.client ?? "Java-Anwendung";

// for "in …": "in Chrome", "in der Java-Anwendung"
export const clientOf = (lock: Lock) =>
  isJavaLock(lock) ? "der Java-Anwendung" : clientLabel(lock);

export const isJavaLock = (lock: Lock) => !parseLockInfo(lock.info)?.client;

export const sinceOf = (lock: Lock) => {
  const time = parseLockInfo(lock.info)?.time;
  return time ? withoutSeconds(time) : undefined;
};

export const isStaleLock = (lock: Lock, hours: number) => {
  const time = parseLockInfo(lock.info)?.time;
  const date = time ? lockDate(time) : undefined;
  return date ? Date.now() - date.getTime() > hours * 3_600_000 : false;
};

export const takeOverWarning = (lock: Lock, staleAfterHours: number) => {
  if (isJavaLock(lock)) {
    return {
      type: "error" as const,
      message: "Änderungen in der Java-Anwendung überschreiben Ihre",
      description:
        "Die Java-Anwendung prüft ihre Sperre beim Speichern nicht. Beenden Sie dort zuerst den Bearbeitungsmodus.",
    };
  }
  if (isStaleLock(lock, staleAfterHours)) {
    return {
      type: "info" as const,
      message: `Die Sperre ist älter als ${String(staleAfterHours)} Stunden`,
      description: `Wahrscheinlich wurde die Bearbeitung in ${clientOf(
        lock
      )} nicht beendet. Dort nicht gespeicherte Änderungen gehen verloren.`,
    };
  }
  return {
    type: "warning" as const,
    message: `Ungespeicherte Änderungen in ${clientOf(lock)} gehen verloren`,
    description: `Nach der Übernahme kann dort nicht mehr gespeichert werden. Wenn Sie dort noch arbeiten, setzen Sie die Bearbeitung besser dort fort.`,
  };
};
