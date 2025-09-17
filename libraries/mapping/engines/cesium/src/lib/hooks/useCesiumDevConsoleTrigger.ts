import { useEffect } from "react";

export type CesiumDevConsoleTriggerOptions = {
  isDeveloperMode?: boolean;
  eventName?: string; // default: "carma:cesium:renderError"
};

// dev helper does not need option overloading

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
    const isDev = options?.isDeveloperMode === true;
    if (!isDev) {
      console.debug(
        "[CARMA][dev] useCesiumDevConsoleTrigger: developer mode disabled (set isDeveloperMode=true in provider to enable trigger)"
      );
      return;
    }
    const win = window as unknown as {
      CARMA_CESIUM_TRIGGER?: {
        renderError?: (err?: unknown) => void;
        renderErrorDebug?: () => void;
      };
    };
    const triggerObj = (win.CARMA_CESIUM_TRIGGER ||= {});
    let registeredSomething = false;
    if (typeof triggerObj.renderError !== "function") {
      triggerObj.renderError = (arg?: unknown) => {
        const error =
          arg instanceof Error
            ? arg
            : arg
            ? new Error(String(arg))
            : new Error("Manual test renderError");
        window.dispatchEvent(new CustomEvent(eventName, { detail: { error } }));
      };
      registeredSomething = true;
    }
    if (typeof triggerObj.renderErrorDebug !== "function") {
      triggerObj.renderErrorDebug = () => {
        debugger; // eslint-disable-line no-debugger
        const error = new Error("Manual debug renderError");
        window.dispatchEvent(new CustomEvent(eventName, { detail: { error } }));
      };
      registeredSomething = true;
    }
    if (registeredSomething) {
      console.info(
        `[CARMA][dev] window.CARMA_CESIUM_TRIGGER.renderError(.renderErrorDebug) available (event: ${eventName})`
      );
    }
  }, [options?.isDeveloperMode, options?.eventName]);
}
