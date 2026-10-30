import { useEffect, useRef } from "react";
import { clientName } from "./client";
import { useLockContext } from "./lockContext";
import { holdTabLock, tabLockName } from "./tabLock";
import type { LockTarget } from "./types";

const SAVE_DELAY_MS = 500;

export interface EditDraft<T> {
  target: LockTarget;
  lockIds: number[];
  payload: T;
}

// While `draft` is set: holds the tab lock and keeps the draft in the browser.
// When it becomes undefined (saved or discarded) the stored draft is removed.
// Closing the tab keeps both the stored draft and the server locks.
export const useEditDraft = <T>(draft: EditDraft<T> | undefined) => {
  const { app, user, drafts } = useLockContext();
  const type = draft?.target.type;
  const id = draft?.target.id;
  const latest = useRef(draft);
  latest.current = draft;

  useEffect(() => {
    if (type === undefined || id === undefined) {
      return;
    }
    const target = { type, id };
    const release = holdTabLock(tabLockName(app, target));
    const flush = () => {
      const current = latest.current;
      if (current) {
        void drafts.save({
          target: current.target,
          user,
          lockIds: current.lockIds,
          client: clientName(),
          savedAt: new Date().toISOString(),
          payload: current.payload,
        });
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      release();
      if (!latest.current) {
        void drafts.remove(user, target);
      }
    };
  }, [app, type, id, user, drafts]);

  useEffect(() => {
    if (!draft) {
      return;
    }
    const timer = window.setTimeout(() => {
      void drafts.save({
        target: draft.target,
        user,
        lockIds: draft.lockIds,
        client: clientName(),
        savedAt: new Date().toISOString(),
        payload: draft.payload,
      });
    }, SAVE_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [draft, user, drafts]);
};
