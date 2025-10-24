import { useEffect, useRef } from "react";

import { useMapStyleBus } from "./useMapStyleBus";
import { useCesiumContext, CtxEvent } from "@carma-mapping/engines/cesium/core";
import { usePortal } from "../contexts/PortalProvider";

/**
 * Syncs MapStyleProvider state to Cesium scene style.
 *
 * Listens to map style changes (via event bus) and emits SetSceneStyle events
 * to update the Cesium scene using the app's configured mapping.
 *
 * This hook should be called at portal-wrapper level (has access to both
 * MapStyleProvider and CesiumContext).
 */
export const useSyncCesiumSceneStyle = () => {
  const { emit } = useCesiumContext();
  const { subscribe } = useMapStyleBus();
  const { mapStyleToCesiumStyleMapping } = usePortal();
  const hasSetInitialStyleRef = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribe((style) => {
      if (!hasSetInitialStyleRef.current) {
        hasSetInitialStyleRef.current = true;
        return; // Skip initial emit
      }

      // Map Portal MapStyle to Cesium scene style using app config
      const cesiumStyleId = mapStyleToCesiumStyleMapping[style];
      if (cesiumStyleId) {
        emit(CtxEvent.SetSceneStyle, cesiumStyleId);
      } else {
        console.warn(
          `[useSyncCesiumSceneStyle] No Cesium style mapped for portal style '${style}'`
        );
      }
    });

    return unsubscribe;
  }, [emit, subscribe, mapStyleToCesiumStyleMapping]);
};
