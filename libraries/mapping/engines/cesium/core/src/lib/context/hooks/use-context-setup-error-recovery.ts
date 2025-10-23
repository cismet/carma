import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { SubscribeFn } from "../cesium-context-event-map";
import { CtxEvent } from "../cesium-context-event-map";

/**
 * Auto-recovery from Cesium render errors
 * Listens for:
 * - carma:cesium:renderError window events
 * - CtxEvent.ReinitScene event bus events (WebGL errors during transitions)
 */
export const useContextSetupErrorRecovery = (
  setRemountKey: Dispatch<SetStateAction<number>>,
  subscribe: SubscribeFn
) => {
  useEffect(() => {
    const handleRecovery = (reason?: string) => {
      console.warn(
        "[CESIUM|RECOVERY] Detected error, remounting widget...",
        reason ? `Reason: ${reason}` : ""
      );
      setRemountKey((prev) => prev + 1);
    };

    // Listen for window events (legacy) - wrap in event listener
    const windowErrorHandler = () => handleRecovery("renderError");
    window.addEventListener("carma:cesium:renderError", windowErrorHandler);

    // Listen for ReinitScene events from event bus (WebGL errors)
    const unsubscribe = subscribe(CtxEvent.ReinitScene, ({ reason }) => {
      console.warn("[CESIUM|RECOVERY] ReinitScene event received:", reason);
      handleRecovery(reason);
    });

    return () => {
      window.removeEventListener(
        "carma:cesium:renderError",
        windowErrorHandler
      );
      unsubscribe();
    };
  }, [setRemountKey, subscribe]);
};
