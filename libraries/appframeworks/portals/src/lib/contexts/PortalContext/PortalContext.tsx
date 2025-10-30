import { createContext } from "react";

import type { MutableRefObject } from "react";
import type { MapStyleKey } from "../../constants";
import type {
  MapEngineRecord,
  ManagedEngineRecord,
  EngineRecords,
} from "../../types/map-engines";
import type { MapView } from "@carma-mapping/engines/leaflet";
import type { CameraState } from "@carma/cesium";

export interface PortalContextType {
  // Gate status - indicates if portal has passed initialization gate
  passedGate: boolean;
  
  // Core state getters - read current values
  getMapStyle: () => MapStyleKey;
  getEngines: () => EngineRecords;
  getView: () => MapView | null;
  getCamera: () => CameraState | null;
  getHomeView: () => MapView | null;
  getHomeCamera: () => CameraState | null;
  
  // Core state setters - mutate values
  setMapStyle: (styleId: MapStyleKey) => void;
  setView: (view: MapView | null) => void;
  setCamera: (camera: CameraState | null) => void;
  setHomeView: (view: MapView | null) => void;
  setHomeCamera: (camera: CameraState | null) => void;
  updateEngine: (engineType: MapEngine, updates: Record<string, unknown>) => void; // Upsert: creates or updates
  
  portalConfig: PortalConfig;
  // Callback refs
  topicMapSyncCallbackRef: MutableRefObject<
    ((styleId: MapStyleKey) => void) | null
  >;
  // Callback registration (simplified - no unregister needed for Redux syncer)
  setTopicMapSyncCallback: (callback: (styleId: MapStyleKey) => void) => void;
  // Engine state
  activeEngines: EngineRecords;
  forEachActiveEngine: (callback: (engine: MapEngineRecord) => void) => void;
  getIsCesiumActive: () => boolean;
}

// Interfaces moved from types/portal.ts to be closer to the provider
export const PortalContext = createContext<PortalContextType | undefined>(
  undefined
);

// Re-export MapEngineRecord for other components
export type { MapEngineRecord } from "../../types/portal";
