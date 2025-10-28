import type { MapView } from "@carma-mapping/engines/leaflet";
import type { HashValues, PortalPositionConfig } from "../../types";

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
    typeof hashValues.latitude === "number" &&
    typeof hashValues.longitude === "number" &&
    typeof hashValues.zoom === "number"
  ) {
    return {
      center: { lat: hashValues.latitude, lng: hashValues.longitude },
      zoom: hashValues.zoom,
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
    center: {
      lat: portalConfig.defaultPosition.latitude,
      lng: portalConfig.defaultPosition.longitude,
    },
    zoom: portalConfig.defaultPosition.zoom,
  };
}
