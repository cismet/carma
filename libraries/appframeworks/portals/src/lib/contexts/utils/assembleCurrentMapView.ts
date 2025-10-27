import type {
  MapView,
  HashValues,
  PortalPositionConfig,
} from "../types/map-view";

/**
 * Assembles the current map view from various sources in priority order:
 * 1. URL hash parameters (highest priority)
 * 2. Portal context currentMapView
 * 3. Portal context homeMapView
 * 4. Portal config defaults (lowest priority)
 */
export function assembleCurrentMapView({
  hashValues,
  currentMapView,
  homeMapView,
  portalConfig,
}: {
  hashValues: HashValues;
  currentMapView: MapView | null;
  homeMapView: MapView | null;
  portalConfig: PortalPositionConfig;
}): MapView {
  // Priority 1: URL hash parameters from context
  if (
    typeof hashValues.lat === "number" &&
    typeof hashValues.lng === "number"
  ) {
    return {
      center: [hashValues.lat, hashValues.lng],
      zoom:
        typeof hashValues.zoom === "number"
          ? hashValues.zoom
          : portalConfig.defaultPosition.zoom,
    };
  }

  // Priority 2: Portal context currentMapView
  if (currentMapView) {
    return currentMapView;
  }

  // Priority 3: Portal context homeMapView
  if (homeMapView) {
    return homeMapView;
  }

  // Priority 4: Portal config defaults
  return {
    center: [
      portalConfig.defaultPosition.latitude,
      portalConfig.defaultPosition.longitude,
    ],
    zoom: portalConfig.defaultPosition.zoom,
  };
}
