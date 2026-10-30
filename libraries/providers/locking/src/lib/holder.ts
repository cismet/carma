import type { HeldLock, Lock } from "./types";

// several rows per object are allowed: the newest is the holder
export const toHeldLock = (locks: Lock[]): HeldLock | undefined => {
  const sorted = [...locks].sort((a, b) => a.id - b.id);
  const holder = sorted.pop();
  return holder ? { ...holder, history: sorted } : undefined;
};

export const isOwnLock = (lock: Lock, accountName: string) =>
  lock.userString === accountName;
