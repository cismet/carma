/**
 * Calculate zoom snap adjustment and distance factor
 * @param currentZoom - Current zoom level
 * @param zoomSnap - Leaflet zoomSnap value (e.g., 0.5, 1)
 * @param threshold - Threshold for rounding (0-1), default 0.75
 * @returns Adjusted zoom, zoom difference, and distance factor
 */
export const calculateZoomSnapAdjustment = (
  currentZoom: number,
  zoomSnap: number,
  threshold: number = 0.75
): { targetZoom: number; zoomDiff: number; distanceFactor: number } => {
  const intMultiple = currentZoom * (1 / zoomSnap);
  const targetZoom =
    intMultiple % 1 < threshold
      ? Math.floor(intMultiple) * zoomSnap
      : Math.ceil(intMultiple) * zoomSnap;
  const zoomDiff = currentZoom - targetZoom;
  const distanceFactor = Math.pow(2, zoomDiff);

  return { targetZoom, zoomDiff, distanceFactor };
};

/**
 * Apply zoom snap adjustment to a Leaflet view
 * @param view - Original Leaflet view with center and zoom
 * @param initialDistance - Camera distance before adjustment
 * @param zoomSnap - Leaflet zoomSnap value (e.g., 0.5, 1), or undefined to skip adjustment
 * @param threshold - Threshold for rounding (0-1), default 0.75
 * @returns Adjusted view, distance, and zoom difference (flat structure for easy destructuring)
 */
export const applyZoomSnapToView = (
  view: { center: { lat: number; lng: number }; zoom: number },
  initialDistance: number,
  zoomSnap: number | undefined,
  threshold: number = 0.75
): {
  view: { center: { lat: number; lng: number }; zoom: number };
  distance: number;
  zoomDiff: number;
} => {
  if (!zoomSnap) {
    return { view, distance: initialDistance, zoomDiff: 0 };
  }

  const snapResult = calculateZoomSnapAdjustment(
    view.zoom,
    zoomSnap,
    threshold
  );
  const distance = initialDistance * snapResult.distanceFactor;

  console.debug("[CESIUM] [CESIUM|2D3D|TO2D] Adjusted for zoomSnap", {
    zoomSnap,
    currentZoom: view.zoom,
    targetZoom: snapResult.targetZoom,
    zoomDiff: snapResult.zoomDiff,
    distanceBefore: initialDistance,
    distanceAfter: distance,
  });

  return {
    view: { center: view.center, zoom: snapResult.targetZoom },
    distance,
    zoomDiff: snapResult.zoomDiff,
  };
};
