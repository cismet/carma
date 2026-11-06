import { useEffect, useRef } from "react";
import { isLockHolder } from "./holder";
import { useLockContext } from "./lockContext";
import type { LockTarget } from "./types";

const CHECK_INTERVAL_MS = 60_000;

// While editing: calls onLost once when `lockId` is no longer the newest row,
// checked on window focus and every minute.
export const useHolderCheck = (
  target: LockTarget | undefined,
  lockId: number | undefined,
  onLost: () => void
) => {
  const { adapter } = useLockContext();
  const lost = useRef(onLost);
  lost.current = onLost;
  const type = target?.type;
  const id = target?.id;

  useEffect(() => {
    if (type === undefined || id === undefined || lockId === undefined) {
      return;
    }
    let done = false;
    const check = () => {
      isLockHolder(adapter, { type, id }, lockId)
        .then((holder) => {
          if (!holder && !done) {
            done = true;
            lost.current();
          }
        })
        .catch((error: unknown) => {
          console.error("Sperre konnte nicht geprüft werden", error);
        });
    };
    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    window.addEventListener("focus", check);
    return () => {
      done = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [adapter, type, id, lockId]);
};
