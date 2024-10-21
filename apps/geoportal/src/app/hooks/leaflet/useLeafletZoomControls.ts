import { useCallback, useMemo } from "react";

import { useSelector } from "react-redux";
import { getLeafletElement } from "../../store/slices/topicmap";

const useLeafletZoomControls = () => {
  const leafletElement = useSelector(getLeafletElement);

  const zoomInLeaflet = useCallback(() => {
    if (!leafletElement) {
      console.warn("No leafletElement found, no zoom level available");
      return;
    }
    const currentZoom = leafletElement.getZoom();
    const newZoom = Math.round(currentZoom) + 1;
    leafletElement.setZoom(newZoom);
  }, [leafletElement]);

  const zoomOutLeaflet = useCallback(() => {
    if (!leafletElement) {
      console.warn("No leafletElement found, no zoom level available");
      return;
    }
    const currentZoom = leafletElement.getZoom();
    const newZoom = Math.round(currentZoom) - 1;
    leafletElement.setZoom(newZoom);
  }, [leafletElement]);

  const getLeafletZoom = useCallback(() => {
    if (!leafletElement) {
      console.warn("No leafletElement found, no zoom level available");
      return;
    }
    return leafletElement.getZoom();
  }, [leafletElement]);

  const zoomControls = useMemo(() => {
    return { zoomInLeaflet, zoomOutLeaflet, getLeafletZoom };
  }, [zoomInLeaflet, zoomOutLeaflet, getLeafletZoom]);

  return zoomControls;
};

export default useLeafletZoomControls;
