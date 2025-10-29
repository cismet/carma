import type { LatLngLiteral } from "leaflet";

/**
 * Strict MapView with explicit lat/lng object (subset of LatLngExpression)
 */
export type MapView = {
  center: LatLngLiteral;
  zoom: number;
};

export const validateMapView = (view: unknown): view is MapView => {
  const isMapView =
    view &&
    typeof view === "object" &&
    "center" in view &&
    typeof view.center === "object" &&
    view.center !== null &&
    "lat" in view.center &&
    "lng" in view.center &&
    typeof view.center.lat === "number" &&
    typeof view.center.lng === "number" &&
    "zoom" in view &&
    typeof view.zoom === "number";
  return Boolean(isMapView);
};
