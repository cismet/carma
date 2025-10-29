import { MutableRefObject } from "react";
import { MapStyleKey } from "../../constants";
import { MapEngineRecord, PortalConfig } from "../../types/portal";
import { MapView } from "../../../../../../mapping/engines/leaflet/src/index.ts";
import { CameraPrimitive } from "../../../../../../cesium/src/index.ts";
export interface PortalContextType {
  mapStyleRef: MutableRefObject<MapStyleKey>;
  enginesRef: MutableRefObject<MapEngineRecord[]>;
  viewRef: MutableRefObject<MapView | null>;
  cameraRef: MutableRefObject<CameraPrimitive | null>;
  homeViewRef: MutableRefObject<MapView | null>;
  homeCameraRef: MutableRefObject<CameraPrimitive | null>;
  portalConfig: PortalConfig;
  topicMapSyncCallbackRef: MutableRefObject<
    ((styleId: MapStyleKey) => void) | null
  >;
  setMapStyle: (styleId: MapStyleKey) => void;
  setTopicMapSyncCallback: (callback: (styleId: MapStyleKey) => void) => void;
  activeEngines: MapEngineRecord[];
  forEachActiveEngine: (callback: (engine: MapEngineRecord) => void) => void;
  isCesiumActive: () => boolean;
}
export declare const PortalContext: import("react").Context<
  PortalContextType | undefined
>;
export type { MapEngineRecord } from "../../types/portal";
