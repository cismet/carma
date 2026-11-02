import { lockDate, parseLockInfo, withoutSeconds } from "./lockInfo";
import type { Lock } from "./types";

// rows without a client part are written by the Java app
export const clientOf = (lock: Lock) =>
  parseLockInfo(lock.info)?.client ?? "der Java-Anwendung";

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

// "seit 9.10.2026, 11:22 in Chrome"
export const describeLock = (lock: Lock) =>
  [sinceOf(lock) && `seit ${sinceOf(lock) ?? ""}`, `in ${clientOf(lock)}`]
    .filter(Boolean)
    .join(" ");
