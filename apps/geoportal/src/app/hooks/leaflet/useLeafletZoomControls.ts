import { useCallback } from "react";

import type { Map as LeafletMap } from "leaflet";

const useLeafletZoomControls = (leafletElement: LeafletMap) => {
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
