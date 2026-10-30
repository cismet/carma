import { useCallback, useEffect, useState } from "react";
import { toHeldLock } from "./holder";
import { useLockContext } from "./lockContext";
import { isTabLockHeld, tabLockName } from "./tabLock";
import type { DraftRecord } from "./draftStore";
import type { LockTarget } from "./types";

export type ResumableDraft<T> =
  | { kind: "none" }
  | { kind: "otherTab"; record: DraftRecord<T> }
  | { kind: "resumable"; record: DraftRecord<T> }
  | { kind: "lockLost"; record: DraftRecord<T> };

const NONE = { kind: "none" } as const;

// Looks for a draft of this user stored in this browser. "resumable" only if
// no other tab edits it and its lock is still the holder.
export const useResumableDraft = <T>(target: LockTarget | undefined) => {
  const { app, user, adapter, drafts } = useLockContext();
  const [state, setState] = useState<ResumableDraft<T>>(NONE);
  const type = target?.type;
  const id = target?.id;

  useEffect(() => {
    setState(NONE);
    if (type === undefined || id === undefined) {
      return;
    }
    const current = { type, id };
    let cancelled = false;
    const check = async (): Promise<ResumableDraft<T>> => {
      const record = await drafts.load<T>(user, current);
      if (!record) {
        return NONE;
      }
      if (await isTabLockHeld(tabLockName(app, current))) {
        return { kind: "otherTab", record };
      }
      const holder = toHeldLock(await adapter.listForObject(current));
      return holder &&
        holder.userString === user &&
        holder.id === record.lockIds[0]
        ? { kind: "resumable", record }
        : { kind: "lockLost", record };
    };
    check()
      .then((result) => {
        if (!cancelled) {
          setState(result);
        }
      })
      .catch((error: unknown) => {
        console.error("Entwurf konnte nicht geprüft werden", error);
      });
    return () => {
      cancelled = true;
    };
  }, [app, user, adapter, drafts, type, id]);

  const discard = useCallback(async () => {
    if (state.kind === "none") {
      return;
    }
    const { record } = state;
    if (state.kind === "resumable") {
      await Promise.allSettled(
        record.lockIds.map((lockId) => adapter.remove(lockId))
      );
    }
    await drafts.remove(user, record.target);
    setState(NONE);
  }, [state, adapter, drafts, user]);

  const dismiss = useCallback(() => {
    setState(NONE);
  }, []);

  return { state, discard, dismiss };
};
