import { useCallback } from "react";
import maplibregl from "maplibre-gl";

export const useLibreZoomControls = ({
  map,
}: {
  map?: maplibregl.Map | null;
}) => {
  /**
   * Zooms in the Leaflet map by one level.
   */
  const zoomInLibre = useCallback(() => {
    if (map) {
      const currentZoom = map.getZoom();
      const newZoom = Math.round(currentZoom) + 1;
      map.setZoom(newZoom);
    }
  }, [map]);

  const zoomOutLibre = useCallback(() => {
    if (map) {
      const currentZoom = map.getZoom();
      const newZoom = Math.round(currentZoom) - 1;
      map.setZoom(newZoom);
    }
  }, [map]);

  const getLibreZoom = useCallback(() => {
    if (map) {
      return map.getZoom();
    }
    console.debug("No leafletElement found, no zoom level available");
    return null;
  }, [map]);

  return { zoomInLibre, zoomOutLibre, getLibreZoom };
};
