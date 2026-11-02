import type { HeldLock, Lock, LockAdapter, LockTarget } from "./types";

// several rows per object are allowed: the newest is the holder
export const toHeldLock = (locks: Lock[]): HeldLock | undefined => {
  const sorted = [...locks].sort((a, b) => a.id - b.id);
  const holder = sorted.pop();
  return holder ? { ...holder, history: sorted } : undefined;
};

export const isOwnLock = (lock: Lock, accountName: string) =>
  lock.userString === accountName;

export const findHolder = async (adapter: LockAdapter, target: LockTarget) =>
  toHeldLock(await adapter.listForObject(target));

export const isLockHolder = async (
  adapter: LockAdapter,
  target: LockTarget,
  lockId: number
) => (await findHolder(adapter, target))?.id === lockId;
