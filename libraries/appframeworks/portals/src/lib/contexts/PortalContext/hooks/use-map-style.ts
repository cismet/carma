import { useCallback } from "react";
import type { MapStyleKey, MapEngineRecord } from "../../types/portal";

/**
 * Internal hook for managing map style changes across active engines
 * Used within PortalStateProvider to avoid circular dependency and keep concerns separated
 */
export const useMapStyle = (
  mapStyleRef: React.MutableRefObject<MapStyleKey>,
  forEachActiveEngine: (
    callback: (
      engine: Extract<MapEngineRecord, { isReady: true; isSuspended: false }>
    ) => void
  ) => void,
  topicMapSyncCallbackRef: React.MutableRefObject<
    ((styleId: MapStyleKey) => void) | null
  >
) => {
  // Unified setMapStyle method that coordinates style changes across all active engines
  const setMapStyle = useCallback(
    (styleId: MapStyleKey) => {
      console.log("[PortalStateProvider] Setting map style to", styleId);

      // Update the style ref
      mapStyleRef.current = styleId;

      // Apply style to all active engines that support setStyle
      forEachActiveEngine((engine) => {
        if ("setStyle" in engine && typeof engine.setStyle === "function") {
          console.log(
            `[PortalStateProvider] Setting style on ${engine.engine}`
          );
          engine.setStyle(styleId);
        }
      });

      // Call topicmap sync callback if registered
      if (topicMapSyncCallbackRef.current) {
        console.log(
          "[PortalStateProvider] Calling topicmap sync callback for style:",
          styleId
        );
        topicMapSyncCallbackRef.current(styleId);
      }
    },
    [forEachActiveEngine, mapStyleRef, topicMapSyncCallbackRef]
  );

  return {
    setMapStyle,
  };
};
