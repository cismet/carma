import { MapStyleKey } from "../../../constants";
import { ManagedEngineRecord } from "../../../types/map-engines";
/**
 * Internal hook for managing map style changes across active engines
 * Used within PortalStateProvider to avoid circular dependency and keep concerns separated
 */
export declare const useMapStyle: (
  mapStyleRef: React.MutableRefObject<MapStyleKey>,
  forEachActiveEngine: (
    callback: (engine: ManagedEngineRecord) => void
  ) => void,
  topicMapSyncCallbackRef: React.MutableRefObject<
    ((styleId: MapStyleKey) => void) | null
  >
) => {
  setMapStyle: (styleId: MapStyleKey) => void;
};
