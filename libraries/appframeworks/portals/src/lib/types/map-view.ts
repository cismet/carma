/**
 * MapView type compatible with Leaflet's center/zoom structure
 */
export interface MapView {
  center: [number, number]; // [lat, lng] - matches Leaflet's LatLngExpression
  zoom: number;
}

/**
 * Hash values from URL parameters
 */
export interface HashValues {
  lat?: number;
  lng?: number;
  zoom?: number;
  // ... other hash values
}

/**
 * Portal config for position defaults
 */
export interface PortalPositionConfig {
  defaultPosition: {
    latitude: number;
    longitude: number;
    zoom: number;
  };
  homePosition: {
    latitude: number;
    longitude: number;
    zoom: number;
  };
}
