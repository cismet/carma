import { useCallback } from "react";
import maplibregl from "maplibre-gl";

type ZoomClick = { shiftKey: boolean };

// an animated zoom can land a hair off its target (12.999999...), which must
// still count as level 13 or the next shift-click would barely move the map
const WHOLE_ZOOM_TOLERANCE = 1e-6;

/**
 * Where a zoom button click takes the map: one level from the current zoom, or
 * on a shift-click the next whole level in that direction.
 */
const getZoomTarget = (
  zoom: number,
  direction: 1 | -1,
  click?: ZoomClick
): number => {
  if (!click?.shiftKey) {
    return zoom + direction;
  }
  return direction === 1
    ? Math.floor(zoom + WHOLE_ZOOM_TOLERANCE) + 1
    : Math.ceil(zoom - WHOLE_ZOOM_TOLERANCE) - 1;
};

export const useLibreZoomControls = ({
  map,
}: {
  map?: maplibregl.Map | null;
}) => {
  const zoomInLibre = useCallback(
    (click?: ZoomClick) => {
      if (map) {
        map.zoomTo(getZoomTarget(map.getZoom(), 1, click));
      }
    },
    [map]
  );

  const zoomOutLibre = useCallback(
    (click?: ZoomClick) => {
      if (map) {
        map.zoomTo(getZoomTarget(map.getZoom(), -1, click));
      }
    },
    [map]
  );

  const getLibreZoom = useCallback(() => {
    if (map) {
      return map.getZoom();
    }
    console.debug("No leafletElement found, no zoom level available");
    return null;
  }, [map]);

  return { zoomInLibre, zoomOutLibre, getLibreZoom };
};
