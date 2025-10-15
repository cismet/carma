/**
 * @carma-mapping/map-view-state
 *
 * Centralized map view state management and position translation
 */

// Cesium adapter
export {
  encodeCesiumCamera,
  decodeCesiumCamera,
  cesiumCameraParamKeys,
  cesiumClearParamKeys,
} from "./lib/adapters/cesiumAdapter";

// Leaflet adapter
export {
  encodeLeafletMap,
  decodeLeafletMap,
  leafletMapParamKeys,
  type LeafletMapState,
} from "./lib/adapters/leafletAdapter";

// Provider and context
export { MapViewStateProvider } from "./provider/MapViewStateProvider";
export {
  MapViewStateContext,
  type MapViewStateContextType,
  type MapMode,
} from "./contexts/MapViewStateContext";

// Hook
export { useMapViewState } from "./hooks/useMapViewState";
