import { useEffect, useRef } from "react";
import { clientName } from "./client";
import { useLockContext } from "./lockContext";
import { holdTabLock, tabLockName } from "./tabLock";
import type { DraftStore } from "./draftStore";
import type { LockTarget } from "./types";

const SAVE_DELAY_MS = 500;

export interface EditDraft<T> {
  target: LockTarget;
  lockIds: number[];
  payload: T;
}

const logError = (error: unknown) => {
  console.error("Entwurf konnte nicht gespeichert werden", error);
};

const store = <T>(drafts: DraftStore, user: string, draft: EditDraft<T>) => {
  drafts
    .save({
      target: draft.target,
      user,
      lockIds: draft.lockIds,
      client: clientName(),
      savedAt: new Date().toISOString(),
      payload: draft.payload,
    })
    .catch(logError);
};

export const useEditDraft = <T>(draft: EditDraft<T> | undefined) => {
  const { app, user, drafts } = useLockContext();
  const type = draft?.target.type;
  const id = draft?.target.id;
  const latest = useRef(draft);
  latest.current = draft;
  const keep = useRef(false);

  useEffect(() => {
    if (type === undefined || id === undefined) {
      return;
    }
    const target = { type, id };
    keep.current = false;
    const release = holdTabLock(tabLockName(app, target));
    const flush = () => {
      if (latest.current) {
        store(drafts, user, latest.current);
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      release();
      if (!latest.current && !keep.current) {
        drafts.remove(user, target).catch(logError);
      }
    };
  }, [app, type, id, user, drafts]);

  useEffect(() => {
    if (!draft) {
      return;
    }
    const timer = window.setTimeout(() => {
      store(drafts, user, draft);
    }, SAVE_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [draft, user, drafts]);

  return {
    keepDraft: () => {
      keep.current = true;
    },
  };
};
