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
  const enabled = options?.enabled;
  const eventName = options?.eventName;
  const onReloadRequested = options?.onReloadRequested;
  useEffect(() => {
    const finalEnabled = enabled ?? true;
    const finalEventName = eventName ?? "carma:cesium:renderError";
    if (!finalEnabled) return;
    const handler = (ev: Event) => {
      try {
        const detail = (ev as CustomEvent).detail as
          | { suppressReload?: boolean }
          | undefined;
        if (detail?.suppressReload) return;
        if (typeof onReloadRequested === "function") onReloadRequested();
        else carmaWindow.location.reload();
      } catch {
        // noop
      }
    };
    window.addEventListener(finalEventName, handler);
    return () => window.removeEventListener(finalEventName, handler);
  }, [enabled, eventName, onReloadRequested]);
}
