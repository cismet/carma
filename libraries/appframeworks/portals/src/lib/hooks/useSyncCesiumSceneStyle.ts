import { useEffect, useRef } from "react";

import { MapStyleKeys, ManagedCesiumStyleKeys } from "../constants";
import { useMapStyleBus } from "./useMapStyleBus";
import { useCesiumContext, CtxEvent } from "@carma-mapping/engines/cesium/core";

/**
 * Synchronizes Cesium scene style with the Portal MapStyle context via event bus.
 * Uses bus approach to avoid React rerenders when only controlling external APIs.
 * Automatically switches between LOD2 and Mesh scene styles based on map style changes.
 */
export const useSyncCesiumSceneStyle = () => {
  const { emit } = useCesiumContext();
  const { subscribe } = useMapStyleBus();
  const currentStyleRef = useRef<string | null>(null);

  useEffect(() => {
    // Subscribe to map style changes via event bus
    const unsubscribe = subscribe((style) => {
      currentStyleRef.current = style;

      // Map Portal MapStyle to Cesium scene styles
      if (style === MapStyleKeys.AERIAL) {
        emit(CtxEvent.SetSceneStyle, ManagedCesiumStyleKeys.MESH);
      } else if (style === MapStyleKeys.TOPO) {
        emit(CtxEvent.SetSceneStyle, ManagedCesiumStyleKeys.LOD2);
      }
    });

    return unsubscribe;
  }, [emit, subscribe]);
};
