import { useEffect } from "react";

export type ReloadOnCesiumRenderErrorOptions = {
  enabled?: boolean; // default true
  eventName?: string; // default "carma:cesium:renderError"
  onReload?: () => void; // default: () => window.location.reload()
};

/**
 * Listen for the centralized Cesium render error and reload (or run a callback).
 */
export function useReloadOnCesiumRenderError(
  options?: ReloadOnCesiumRenderErrorOptions
) {
  useEffect(() => {
    const {
      enabled = true,
      eventName = "carma:cesium:renderError",
      onReload,
    } = options || {};
    if (!enabled) return;
    const handler = () => {
      try {
        if (typeof onReload === "function") {
          onReload();
        } else {
          window.location.reload();
        }
      } catch (e) {
        // noop
      }
    };

    window.addEventListener(eventName, handler);
    return () => window.removeEventListener(eventName, handler);
  }, [options, options?.enabled, options?.eventName, options?.onReload]);
}
