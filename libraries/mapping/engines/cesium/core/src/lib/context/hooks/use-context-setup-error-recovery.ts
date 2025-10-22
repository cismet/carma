import { useEffect, type Dispatch, type SetStateAction } from "react";

/**
 * Auto-recovery from Cesium render errors
 * Listens for carma:cesium:renderError events and remounts the widget
 */
export const useContextSetupErrorRecovery = (
  setRemountKey: Dispatch<SetStateAction<number>>
) => {
  useEffect(() => {
    const handleRecovery = () => {
      console.warn("[CESIUM|RECOVERY] Detected error, remounting widget...");
      setRemountKey((prev) => prev + 1);
    };

    window.addEventListener("carma:cesium:renderError", handleRecovery);
    return () =>
      window.removeEventListener("carma:cesium:renderError", handleRecovery);
  }, [setRemountKey]);
};
