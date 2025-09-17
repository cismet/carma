import { useEffect } from "react";
import { carmaWindow } from "@carma-commons/utils";

export type ReloadOnCesiumRenderErrorOptions = {
  enabled?: boolean; // default true
  eventName?: string; // default "carma:cesium:renderError"
  onReloadRequested?: () => void; // defaults to calling window.location.reload()
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
      onReloadRequested,
    } = options || {};
    if (!enabled) return;
    const handler = () => {
      try {
        if (typeof onReloadRequested === "function") onReloadRequested();
        else carmaWindow.location.reload();
      } catch (e) {
        // noop
      }
    };

    window.addEventListener(eventName, handler);
    return () => window.removeEventListener(eventName, handler);
  }, [
    options,
    options?.enabled,
    options?.eventName,
    options?.onReloadRequested,
  ]);
}
