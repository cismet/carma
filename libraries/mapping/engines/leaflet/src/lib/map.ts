import { Map as LeafletMap } from "leaflet";

// Re-export for instanceof checks in consuming code
export { LeafletMap };

/**
 * Extracts lat/lng/zoom from Leaflet map.
 * Corresponds to leaflet Map API methods: getCenter() and getZoom()
 *
 * @param leafletMap - The Leaflet map instance
 * @returns Object containing latitude, longitude, and zoom level
 * @throws Error if map doesn't provide valid center or zoom values
 */
export const getLeafletPosition = (
  leafletMap: LeafletMap
): {
  lat: number;
  lng: number;
  zoom: number;
} => {
  const center = leafletMap.getCenter();
  const zoom = leafletMap.getZoom();

  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
    throw new Error("Leaflet map does not provide valid center");
  }
  if (zoom === undefined || !Number.isFinite(zoom)) {
    throw new Error("Leaflet map does not provide valid zoom");
  }

  return {
    lat: center.lat,
    lng: center.lng,
    zoom,
  };
};
