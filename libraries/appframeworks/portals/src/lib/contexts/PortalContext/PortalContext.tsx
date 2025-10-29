import { createContext } from "react";

import type { MutableRefObject } from "react";
import type { MapStyleKey } from "../../constants";
import type {
  MapEngine,
  MapEngineRecord,
  PortalConfig,
} from "../../types/portal";
import type { MapView } from "@carma-mapping/engines/leaflet";
import type { CameraState } from "@carma/cesium";

export interface PortalContextType {
  // Gate status - indicates if portal has passed initialization gate
  passedGate: boolean;
  
  // Core state getters - read current values
  getMapStyle: () => MapStyleKey;
  getEngines: () => MapEngineRecord[];
  getView: () => MapView | null;
  getCamera: () => CameraState | null;
  getHomeView: () => MapView | null;
  getHomeCamera: () => CameraState | null;
  
  // Core state updaters - mutate values
  setEngines: (engines: MapEngineRecord[] | ((prev: MapEngineRecord[]) => MapEngineRecord[])) => void;
  updateEngine: (engineType: MapEngine, updates: Partial<MapEngineRecord>) => void;
  
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
  activeEngines: MapEngineRecord[];
  forEachActiveEngine: (callback: (engine: MapEngineRecord) => void) => void;
  isCesiumActive: () => boolean;
}

// Interfaces moved from types/portal.ts to be closer to the provider
export const PortalContext = createContext<PortalContextType | undefined>(
  undefined
);

// Re-export MapEngineRecord for other components
export type { MapEngineRecord } from "../../types/portal";
