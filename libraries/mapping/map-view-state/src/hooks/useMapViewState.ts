import { useContext } from "react";
import { MapViewStateContext } from "../contexts/MapViewStateContext";

/**
 * Hook to access map view state
 *
 * Must be used within MapViewStateProvider
 *
 * @example
 * ```typescript
 * const { mode, cesiumState, leafletState, updateCesiumPosition } = useMapViewState();
 *
 * // In Cesium component
 * if (cesiumState) {
 *   camera.setView({ destination: cesiumState.position });
 * }
 *
 * // In Leaflet component
 * if (leafletState) {
 *   map.setView([leafletState.lat, leafletState.lng], leafletState.zoom);
 * }
 * ```
 */
export const useMapViewState = () => {
  const context = useContext(MapViewStateContext);

  if (!context) {
    throw new Error("useMapViewState must be used within MapViewStateProvider");
  }

  return context;
};
