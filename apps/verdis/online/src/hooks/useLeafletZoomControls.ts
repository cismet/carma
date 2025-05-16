import { useCallback } from "react";
import type { Map as LeafletMap } from "leaflet";

/**
 * Custom hook to handle Leaflet zoom controls.
 * Provides stable zoom in and zoom out functions.
 */
export const useLeafletZoomControls = (routedMapRef) => {
  const leafletElement: LeafletMap | undefined =
    routedMapRef.current?.leafletMap?.leafletElement;

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
    console.debug("No leafletElement found, no zoom level available");
    return null;
  }, [leafletElement]);

  return { zoomInLeaflet, zoomOutLeaflet, getLeafletZoom };
};
