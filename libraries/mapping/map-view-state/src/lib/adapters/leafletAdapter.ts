/**
 * Leaflet Map State Adapter
 *
 * Converts between URL hash parameters and Leaflet map state (2D position).
 * To be implemented - placeholder for future development.
 */

/**
 * Leaflet map position state
 */
export type LeafletMapState = {
  lat: number;
  lng: number;
  zoom: number;
};

/**
 * URL parameter keys used by Leaflet map state
 */
export const leafletMapParamKeys = ["lat", "lng", "zoom"];

/**
 * Encode Leaflet map state to URL hash parameters
 * TODO: Implement
 */
export const encodeLeafletMap = (
  state: LeafletMapState
): Record<string, string> => {
  return {
    lat: state.lat.toFixed(7),
    lng: state.lng.toFixed(7),
    zoom: state.zoom.toString(),
  };
};

/**
 * Decode URL hash parameters to Leaflet map state
 * TODO: Implement with proper validation
 */
export const decodeLeafletMap = (
  hashParams: Record<string, string>
): LeafletMapState | null => {
  const lat = Number(hashParams.lat);
  const lng = Number(hashParams.lng);
  const zoom = Number(hashParams.zoom);

  if (!isFinite(lat) || !isFinite(lng) || !isFinite(zoom)) {
    return null;
  }

  return { lat, lng, zoom };
};
