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
    const devFlag = options?.isDeveloperMode === true;
    if (!devFlag) {
      console.debug(
        "[CARMA][dev] useCesiumDevConsoleTrigger: developer mode disabled (set isDeveloperMode=true in provider to enable trigger)"
      );
      return;
    }
    const localDev = (() => {
      try {
        return Boolean(
          typeof import.meta !== "undefined" && import.meta.env?.DEV
        );
      } catch {
        return false;
      }
    })();
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
    // Only register the debug variant (with debugger) in local dev builds
    if (localDev && typeof triggerObj.renderErrorDebug !== "function") {
      triggerObj.renderErrorDebug = () => {
        debugger; // eslint-disable-line no-debugger
        const error = new Error("Manual debug renderError");
        window.dispatchEvent(new CustomEvent(eventName, { detail: { error } }));
      };
      registeredSomething = true;
    }
    if (registeredSomething) {
      const dbgInfo = localDev
        ? ".renderErrorDebug"
        : " (renderErrorDebug only in local dev)";
      console.info(
        `[CARMA][dev] window.CARMA_CESIUM_TRIGGER.renderError${dbgInfo} available (event: ${eventName})`
      );
    }
  }, [options?.isDeveloperMode, options?.eventName]);
}
