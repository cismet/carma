import type { LockTarget } from "./types";

// names held by this tab; query() lists the locks of all tabs
const ownLocks = new Set<string>();

export const tabLockName = (app: string, { type, id }: LockTarget) =>
  `${app}-edit-${type}-${String(id)}`;

// The browser frees a Web Lock by itself when the tab closes or crashes.
export const holdTabLock = (name: string): (() => void) => {
  if (!("locks" in navigator)) {
    return () => undefined;
  }
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  void navigator.locks.request(name, () => {
    ownLocks.add(name);
    return held.finally(() => ownLocks.delete(name));
  });
  return () => {
    release();
  };
};

export const isTabLockHeld = async (name: string) => {
  if (!("locks" in navigator)) {
    return false;
  }
  const { held } = await navigator.locks.query();
  return (held ?? []).some((lock) => lock.name === name);
};

// Like holdTabLock, but only if no other tab holds it: undefined then.
export const tryHoldTabLock = (
  name: string
): Promise<(() => void) | undefined> => {
  if (!("locks" in navigator)) {
    return Promise.resolve(() => undefined);
  }
  return new Promise((resolve) => {
    void navigator.locks.request(name, { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve(undefined);
        return undefined;
      }
      ownLocks.add(name);
      return new Promise<void>((release) => {
        resolve(() => {
          ownLocks.delete(name);
          release();
        });
      });
    });
  });
};

export const isHeldByOtherTab = async (name: string) =>
  !ownLocks.has(name) && (await isTabLockHeld(name));
