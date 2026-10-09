import { useEffect } from "react";

/**
 * Keeps the screen on while `active` holds: a navigation whose phone goes dark
 * after thirty seconds is no navigation.
 *
 * The browser drops the lock whenever the tab is hidden (another app, the
 * screen switched off by hand), so it is asked for again each time the tab is
 * visible again. Where there is no wake lock (older iOS, a page not served
 * over HTTPS) or the browser refuses it (battery saver), nothing happens: the
 * screen goes dark as it always did.
 */
export const useWakeLock = (active: boolean) => {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) {
      return;
    }
    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    const request = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      navigator.wakeLock
        .request("screen")
        .then((lock) => {
          if (released) {
            void lock.release();
            return;
          }
          sentinel = lock;
        })
        .catch((error: unknown) => {
          console.warn("[ROUTING] no wake lock", { error });
        });
    };

    request();
    document.addEventListener("visibilitychange", request);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", request);
      void sentinel?.release();
      sentinel = null;
    };
  }, [active]);
};
