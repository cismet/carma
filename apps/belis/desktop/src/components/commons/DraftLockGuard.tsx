import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { message } from "antd";
import {
  LockLostDialog,
  TakeOverDialog,
  formatLockInfo,
  isOwnLock,
  lockTimestamp,
  notifyLockConflict,
  tabLockName,
  toHeldLock,
  tryHoldTabLock,
  useLockContext,
} from "@carma-providers/locking";
import type {
  DraftRecord,
  HeldLock,
  LockConflict,
  LockTarget,
  ObjectLock,
} from "@carma-providers/locking";
import {
  WEB_CLIENT,
  dropLockedDraft,
  selectDraftLockTargets,
  type DraftLockTarget,
} from "../../helper/draftLocks";
import {
  getHeldDraftLocks,
  removeHeldDraftLock,
  setHeldDraftLock,
  setOtherTab,
  type HeldDraftLock,
} from "../../store/slices/draftLocks";

const CHECK_INTERVAL_MS = 60_000;

interface TakeOverPrompt {
  key: string;
  target: DraftLockTarget;
  lock: HeldLock;
}

interface LostLock {
  key: string;
  held: HeldDraftLock;
  holder: HeldLock | undefined;
}

const signatureOf = (record: object) => Object.keys(record).sort().join("|");

// Locks each draft of an existing object in `sperre` while the draft exists:
// taken when the draft appears, removed when it is saved or discarded.
const DraftLockGuard = () => {
  const dispatch = useDispatch();
  const { adapter, user } = useLockContext();
  const targets = useSelector(selectDraftLockTargets);
  const held = useSelector(getHeldDraftLocks);
  const latest = useRef({ targets, held });
  latest.current = { targets, held };
  // keys with a request or a dialog in flight
  const busy = useRef(new Set<string>());
  // retried on window focus instead of on every keystroke
  const failed = useRef(new Set<string>());
  // All tabs share the persisted drafts and held locks, so a Web Lock per
  // object tells which tab edits it. One object can have several draft keys
  // (the source layer differs by selection path), so a lock is shared by all
  // keys of this tab. Keys of other tabs are retried on focus.
  const tabLocks = useRef(
    new Map<string, { release: () => void; keys: Set<string> }>()
  );
  const tabLockOf = useRef(new Map<string, string>());
  const otherTab = useRef(new Set<string>());
  const claiming = useRef(new Map<string, Promise<void>>());
  const [takeOvers, setTakeOvers] = useState<TakeOverPrompt[]>([]);
  const [lost, setLost] = useState<LostLock[]>([]);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [recheck, setRecheck] = useState(0);

  const claimTab = useCallback(
    async (key: string, target: LockTarget) => {
      const name = tabLockName("belis", target);
      if (tabLockOf.current.get(key) === name) {
        return true;
      }
      if (!tabLocks.current.has(name)) {
        // a second request of this tab would see its own Web Lock as taken
        let pending = claiming.current.get(name);
        if (!pending) {
          pending = tryHoldTabLock(name).then((release) => {
            claiming.current.delete(name);
            if (release) {
              tabLocks.current.set(name, { release, keys: new Set() });
            }
          });
          claiming.current.set(name, pending);
        }
        await pending;
      }
      const entry = tabLocks.current.get(name);
      if (entry) {
        entry.keys.add(key);
        tabLockOf.current.set(key, name);
        otherTab.current.delete(key);
      } else {
        otherTab.current.add(key);
      }
      dispatch(setOtherTab({ key, value: !entry }));
      return Boolean(entry);
    },
    [dispatch]
  );

  const freeTab = useCallback((key: string) => {
    const name = tabLockOf.current.get(key);
    tabLockOf.current.delete(key);
    const entry = name ? tabLocks.current.get(name) : undefined;
    if (!name || !entry) {
      return;
    }
    entry.keys.delete(key);
    if (!entry.keys.size) {
      entry.release();
      tabLocks.current.delete(name);
    }
  }, []);

  // another draft key of this tab already holds the object's lock
  const heldForObject = (key: string, target: LockTarget) =>
    Object.entries(latest.current.held).find(
      ([other, lock]) =>
        other !== key &&
        lock.type === target.type &&
        lock.id === target.id &&
        tabLockOf.current.has(other)
    )?.[1];

  const writeLock = useCallback(
    async (key: string, target: DraftLockTarget, replaced?: HeldLock) => {
      const lockId = await adapter.write(
        { type: target.type, id: target.id },
        user,
        formatLockInfo({
          context: target.label,
          object: "-",
          time: lockTimestamp(),
          client: WEB_CLIENT,
        })
      );
      dispatch(
        setHeldDraftLock({
          key,
          lock: {
            type: target.type,
            id: target.id,
            label: target.label,
            lockId,
          },
        })
      );
      // new row first, so the object is never unlocked in between
      if (replaced) {
        await Promise.allSettled(
          [replaced, ...replaced.history].map((row) => adapter.remove(row.id))
        );
      }
    },
    [adapter, user, dispatch]
  );

  const acquireAll = useCallback(
    async (entries: [string, DraftLockTarget][]) => {
      const conflicts: LockConflict[] = [];
      await Promise.all(
        entries.map(async ([key, target]) => {
          busy.current.add(key);
          let prompted = false;
          try {
            if (!(await claimTab(key, target))) {
              return;
            }
            const shared = heldForObject(key, target);
            if (shared) {
              dispatch(setHeldDraftLock({ key, lock: shared }));
              return;
            }
            const existing = toHeldLock(await adapter.listForObject(target));
            if (!existing) {
              await writeLock(key, target);
            } else if (isOwnLock(existing, user)) {
              prompted = true;
              setTakeOvers((queue) => [
                ...queue,
                { key, target, lock: existing },
              ]);
            } else {
              freeTab(key);
              dropLockedDraft(dispatch, key);
              conflicts.push({
                key,
                objectLabel: target.label,
                lock: existing,
                own: false,
              });
            }
          } catch (error) {
            console.error("Sperre konnte nicht angelegt werden", error);
            freeTab(key);
            failed.current.add(key);
            void message.error(
              `Die Sperre für ${target.label} konnte nicht angelegt werden: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          } finally {
            if (!prompted) {
              busy.current.delete(key);
            }
          }
        })
      );
      notifyLockConflict(conflicts);
    },
    [adapter, user, dispatch, writeLock, claimTab, freeTab]
  );

  const release = useCallback(
    async (key: string, lock: HeldDraftLock) => {
      busy.current.add(key);
      try {
        // the other tab releases its own lock
        if (!(await claimTab(key, lock))) {
          return;
        }
        const stillUsed = Object.entries(latest.current.held).some(
          ([other, { lockId }]) => other !== key && lockId === lock.lockId
        );
        if (!stillUsed) {
          await adapter.remove(lock.lockId);
        }
      } catch (error) {
        // best effort, like LAGIS: a leftover row can be taken over later
        console.error("Sperre konnte nicht gelöst werden", error);
      } finally {
        busy.current.delete(key);
      }
      dispatch(removeHeldDraftLock(key));
      freeTab(key);
    },
    [adapter, dispatch, claimTab, freeTab]
  );

  const targetSignature = useMemo(() => signatureOf(targets), [targets]);
  const heldSignature = useMemo(() => signatureOf(held), [held]);

  useEffect(() => {
    const { targets: wanted, held: current } = latest.current;
    for (const key of failed.current) {
      if (!wanted[key]) {
        failed.current.delete(key);
      }
    }
    const moved = new Set<string>();
    for (const [key, lock] of Object.entries(current)) {
      if (busy.current.has(key) || otherTab.current.has(key)) {
        continue;
      }
      // the draft got a new key for the same object: keep the lock
      const renamed = wanted[key]
        ? undefined
        : Object.entries(wanted).find(
            ([other, target]) =>
              !current[other] &&
              !moved.has(other) &&
              target.type === lock.type &&
              target.id === lock.id
          )?.[0];
      const name = tabLockOf.current.get(key);
      const entry = name ? tabLocks.current.get(name) : undefined;
      if (renamed && name && entry) {
        moved.add(renamed);
        entry.keys.add(renamed);
        tabLockOf.current.set(renamed, name);
        dispatch(setHeldDraftLock({ key: renamed, lock }));
        dispatch(removeHeldDraftLock(key));
        freeTab(key);
      } else if (!wanted[key]) {
        void release(key, lock);
      } else if (!tabLockOf.current.has(key)) {
        // held lock from storage: this tab or another one edits it
        void claimTab(key, lock);
      }
    }
    for (const key of otherTab.current) {
      if (!wanted[key] && !current[key]) {
        otherTab.current.delete(key);
        dispatch(setOtherTab({ key, value: false }));
      }
    }
    const missing = Object.entries(wanted).filter(
      ([key]) =>
        !current[key] &&
        !busy.current.has(key) &&
        !failed.current.has(key) &&
        !otherTab.current.has(key) &&
        !moved.has(key)
    );
    if (missing.length) {
      void acquireAll(missing);
    }
  }, [
    targetSignature,
    heldSignature,
    recheck,
    acquireAll,
    release,
    claimTab,
    freeTab,
    dispatch,
  ]);

  useEffect(
    () => () => {
      for (const { release } of tabLocks.current.values()) {
        release();
      }
      tabLocks.current.clear();
      tabLockOf.current.clear();
    },
    []
  );

  // A held row can be removed (lock list, Java) or taken over in another
  // client; checked on start, on window focus and every minute.
  const checkHeld = useCallback(async () => {
    const entries = Object.entries(latest.current.held).filter(([key]) =>
      tabLockOf.current.has(key)
    );
    const byType = new Map<string, number[]>();
    for (const [, lock] of entries) {
      byType.set(lock.type, [...(byType.get(lock.type) ?? []), lock.id]);
    }
    const rows = new Map<string, ObjectLock[]>();
    try {
      for (const [type, ids] of byType) {
        for (const row of await adapter.listForObjects(type, ids)) {
          const objectKey = `${type}:${String(row.objectId)}`;
          rows.set(objectKey, [...(rows.get(objectKey) ?? []), row]);
        }
      }
    } catch (error) {
      console.error("Sperren konnten nicht geprüft werden", error);
      return;
    }
    setLost(
      entries
        .filter(([key]) => !busy.current.has(key))
        .map(([key, lock]) => ({
          key,
          held: lock,
          holder: toHeldLock(rows.get(`${lock.type}:${String(lock.id)}`) ?? []),
        }))
        .filter(({ held: lock, holder }) => holder?.id !== lock.lockId)
    );
  }, [adapter]);

  useEffect(() => {
    void checkHeld();
    const onFocus = () => {
      failed.current.clear();
      otherTab.current.clear();
      setRecheck((n) => n + 1);
      void checkHeld();
    };
    const timer = window.setInterval(() => void checkHeld(), CHECK_INTERVAL_MS);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [checkHeld]);

  const runDialogAction = async (action: () => Promise<void>) => {
    setDialogBusy(true);
    try {
      await action();
      return true;
    } catch (error) {
      console.error("Sperre konnte nicht angelegt werden", error);
      void message.error("Die Sperre konnte nicht angelegt werden.");
      return false;
    } finally {
      setDialogBusy(false);
    }
  };

  const takeOver = takeOvers[0];
  const finishTakeOver = (prompt: TakeOverPrompt) => {
    busy.current.delete(prompt.key);
    setTakeOvers((queue) => queue.slice(1));
  };

  const lostLock = lost[0];
  const lostTarget = lostLock && {
    type: lostLock.held.type,
    id: lostLock.held.id,
    label: lostLock.held.label,
  };
  const lostRecord: DraftRecord | undefined = lostLock && {
    target: { type: lostLock.held.type, id: lostLock.held.id },
    user,
    lockIds: [lostLock.held.lockId],
    client: WEB_CLIENT,
    savedAt: new Date(
      targets[lostLock.key]?.updatedAt ?? Date.now()
    ).toISOString(),
    payload: null,
  };
  const closeLost = () => {
    setLost((list) => list.slice(1));
  };

  return (
    <>
      <TakeOverDialog
        lock={takeOver?.lock}
        objectLabel={takeOver?.target.label ?? ""}
        busy={dialogBusy}
        onTakeOver={() => {
          if (!takeOver) return;
          void runDialogAction(async () => {
            await writeLock(takeOver.key, takeOver.target, takeOver.lock);
          }).finally(() => {
            finishTakeOver(takeOver);
          });
        }}
        onCancel={() => {
          if (!takeOver) return;
          freeTab(takeOver.key);
          dropLockedDraft(dispatch, takeOver.key);
          finishTakeOver(takeOver);
        }}
      />
      <LockLostDialog
        record={takeOver ? undefined : lostRecord}
        holder={lostLock?.holder}
        objectLabel={lostLock?.held.label ?? ""}
        busy={dialogBusy}
        onRelock={() => {
          if (!lostLock || !lostTarget) return;
          void runDialogAction(() => writeLock(lostLock.key, lostTarget)).then(
            (done) => done && closeLost()
          );
        }}
        onTakeOver={() => {
          if (!lostLock || !lostTarget || !lostLock.holder) return;
          void runDialogAction(() =>
            writeLock(lostLock.key, lostTarget, lostLock.holder)
          ).then((done) => done && closeLost());
        }}
        onDiscard={() => {
          if (!lostLock) return;
          // the row is gone or someone else's: nothing to remove
          dispatch(removeHeldDraftLock(lostLock.key));
          freeTab(lostLock.key);
          dropLockedDraft(dispatch, lostLock.key);
          closeLost();
        }}
        onLater={closeLost}
      />
    </>
  );
};

export default DraftLockGuard;
