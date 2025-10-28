import { createContext } from "react";

import type { MutableRefObject } from "react";
import type { MapStyleKey } from "../../constants";
import type { MapEngine, PortalConfig } from "../../types/portal";
import type { MapView } from "@carma-mapping/engines/leaflet";
import type { CameraPrimitive } from "@carma/cesium";

export interface PortalContextType {
  // Core state refs
  mapStyleRef: MutableRefObject<MapStyleKey>;
  enginesRef: MutableRefObject<MapEngineRecord[]>;
  viewRef: MutableRefObject<MapView | null>;
  cameraRef: MutableRefObject<CameraPrimitive | null>;
  homeViewRef: MutableRefObject<MapView | null>;
  homeCameraRef: MutableRefObject<CameraPrimitive | null>;
  portalConfig: PortalConfig;
  // Callback refs
  topicMapSyncCallbackRef: MutableRefObject<
    ((styleId: MapStyleKey) => void) | null
  >;
  // Style management
  setMapStyle: (styleId: MapStyleKey) => void;
  // Callback registration (simplified - no unregister needed for Redux syncer)
  setTopicMapSyncCallback: (callback: (styleId: MapStyleKey) => void) => void;
  // Engine state
  isCesiumActive: () => boolean;
}

// Interfaces moved from types/portal.ts to be closer to the provider
export const PortalContext = createContext<PortalContextType | undefined>(
  undefined
);
