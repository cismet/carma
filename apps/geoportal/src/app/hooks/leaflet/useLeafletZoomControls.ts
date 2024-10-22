import { useCallback, useContext } from "react";
import type { Map as LeafletMap } from "leaflet";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

/**
 * Custom hook to handle Leaflet zoom controls.
 * Provides stable zoom in and zoom out functions.
 */
const useLeafletZoomControls = () => {
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);

  const leafletElement: LeafletMap | undefined =
    routedMapRef?.leafletMap?.leafletElement;

  /**
   * Zooms in the Leaflet map by one level.
   */
  const zoomInLeaflet = useCallback(() => {
    if (leafletElement) {
      const currentZoom = leafletElement.getZoom();
      const newZoom = Math.round(currentZoom) + 1;
      leafletElement.setZoom(newZoom);
    }
  }, [leafletElement]);

  const zoomOutLeaflet = useCallback(() => {
    if (leafletElement) {
      const currentZoom = leafletElement.getZoom();
      const newZoom = Math.round(currentZoom) - 1;
      leafletElement.setZoom(newZoom);
    }
  }, [leafletElement]);

  const getLeafletZoom = useCallback(() => {
    if (leafletElement) {
      return leafletElement.getZoom();
    }
    console.warn("No leafletElement found, no zoom level available");
    return null;
  }, [leafletElement]);

  return { zoomInLeaflet, zoomOutLeaflet, getLeafletZoom };
};

export default useLeafletZoomControls;
