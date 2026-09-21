import { useEffect } from "react";

const LOG_PREFIX = "[PM REMOTE]";

/**
 * Keep the phone's screen on while `active`. The browser drops the lock when
 * the page is hidden, so it is taken again each time the page comes back.
 * Where the API is missing (older iOS) the screen just sleeps as usual.
 */
export const useWakeLock = (active: boolean): void => {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) {
      return;
    }
    let lock: WakeLockSentinel | null = null;
    let isCurrent = true;

    const request = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      navigator.wakeLock.request("screen").then(
        (sentinel) => {
          if (isCurrent) {
            lock = sentinel;
          } else {
            void sentinel.release();
          }
        },
        (error: unknown) => {
          console.warn(`${LOG_PREFIX} wake lock refused`, error);
        }
      );
    };

    request();
    document.addEventListener("visibilitychange", request);
    return () => {
      isCurrent = false;
      document.removeEventListener("visibilitychange", request);
      void lock?.release();
    };
  }, [active]);
};
