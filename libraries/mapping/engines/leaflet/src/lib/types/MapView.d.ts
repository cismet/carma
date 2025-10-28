import type { LatLngLiteral } from "leaflet";

/**
 * Strict MapView with explicit lat/lng object (subset of LatLngExpression)
 */
export interface MapView {
  center: LatLngLiteral;
  zoom: number;
}
