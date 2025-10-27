import { useEffect, type Dispatch, type SetStateAction } from "react";

/**
 * Auto-recovery from Cesium render errors
 * Listens for:
 * - carma:cesium:renderError window events
 * - Direct ref polling for error state (WebGL errors during transitions)
 */
export const useContextSetupErrorRecovery = (
  setRemountKey: Dispatch<SetStateAction<number>>
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

    // Event bus removed - using direct ref polling instead
    // WebGL errors will be handled by direct ref manipulation

    return () => {
      window.removeEventListener(
        "carma:cesium:renderError",
        windowErrorHandler
      );
    };
  }, [setRemountKey]);
};
