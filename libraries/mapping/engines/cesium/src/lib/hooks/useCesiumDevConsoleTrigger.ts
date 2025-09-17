import { useEffect } from "react";

export type CesiumDevConsoleTriggerOptions = {
  isDeveloperMode?: boolean;
  eventName?: string; // default: "carma:cesium:renderError"
};

/**
 * Register a simple console helper to simulate a Cesium renderError.
 * It exposes window.CARMA_CESIUM_TRIGGER.renderError(err?) which dispatches a CustomEvent.
 * If isDeveloperMode is not provided, we log a debug message and do not register.
 */
export function useCesiumDevConsoleTrigger(
  options?: CesiumDevConsoleTriggerOptions
) {
  useEffect(() => {
    const eventName = options?.eventName ?? "carma:cesium:renderError";
    const inferDev = () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const flag = params.get("dev") ?? params.get("isDeveloperMode");
        return flag !== null && flag !== "0" && flag !== "false";
      } catch {
        return false;
      }
    };

    const isDev = options?.isDeveloperMode ?? inferDev();
    if (!isDev) {
      console.debug(
        "[CARMA][dev] useCesiumDevConsoleTrigger: FeatureFlagProvider is not available or dev flag is off; pass isDeveloperMode to enable"
      );
      return;
    }

    const w = window as unknown as {
      CARMA_CESIUM_TRIGGER?: { renderError?: (err?: unknown) => void };
    };
    if (!w.CARMA_CESIUM_TRIGGER) w.CARMA_CESIUM_TRIGGER = {};
    if (typeof w.CARMA_CESIUM_TRIGGER.renderError !== "function") {
      w.CARMA_CESIUM_TRIGGER.renderError = (err?: unknown) => {
        window.dispatchEvent(
          new CustomEvent(eventName, {
            detail: { error: err ?? new Error("Manual test renderError") },
          })
        );
      };
      console.info(
        `[CARMA][dev] window.CARMA_CESIUM_TRIGGER.renderError available (event: ${eventName})`
      );
    }
  }, [options?.isDeveloperMode, options?.eventName]);
}
