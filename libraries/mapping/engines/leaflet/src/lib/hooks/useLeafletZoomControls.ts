import { useCallback, type MutableRefObject } from "react";
import type { Map as LeafletMap } from "leaflet";

/**
 * Custom hook to handle Leaflet zoom controls.
 * Provides stable zoom in and zoom out functions.
 *
 * @param mapRef - A mutable ref object containing the Leaflet map instance
 * @returns Zoom control functions and current zoom getter
 */
export const useLeafletZoomControls = (
  mapRef: MutableRefObject<LeafletMap | null | undefined>
) => {
  const zoomInLeaflet = useCallback(() => {
    const map = mapRef.current;
    if (map) {
      const currentZoom = map.getZoom();
      const newZoom = Math.round(currentZoom) + 1;
      map.setZoom(newZoom);
    }
  }, [mapRef]);

  const zoomOutLeaflet = useCallback(() => {
    const map = mapRef.current;
    if (map) {
      const currentZoom = map.getZoom();
      const newZoom = Math.round(currentZoom) - 1;
      map.setZoom(newZoom);
    }
  }, [mapRef]);

  const getLeafletZoom = useCallback(() => {
    const map = mapRef.current;
    if (map) {
      return map.getZoom();
    }
    console.debug("No leaflet map found, no zoom level available");
    return null;
  }, [mapRef]);

  return { zoomInLeaflet, zoomOutLeaflet, getLeafletZoom };
};
