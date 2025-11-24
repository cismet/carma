/**
 * Measurement Geometry Utilities
 * Pure calculation functions for distance and area measurements
 * Extracted from measure-path.ts to reduce file size and improve testability
 */

import L from "leaflet";

/**
 * Calculate total distance along a path of LatLng points
 * @param latlngs - Array of Leaflet LatLng points
 * @returns Distance in meters
 */
export function calculateDistance(latlngs: L.LatLng[]): number {
  let totalDistance = 0;

  for (let i = 0; i < latlngs.length - 1; i++) {
    const point1 = latlngs[i];
    const point2 = latlngs[i + 1];
    const distance = point1.distanceTo(point2);
    totalDistance += distance;
  }

  return totalDistance;
}

/**
 * Calculate area of a polygon using spherical geometry
 * @param latlngs - Array of [lat, lng] coordinate pairs forming a closed polygon
 * @returns Formatted area string (e.g., "123.45 m²" or "1.23 km²")
 */
export function calculateArea(latlngs: number[][]): string {
  const toRadians = (degree: number): number => (degree * Math.PI) / 180;

  if (latlngs.length < 3) return "0 m²";

  const earthRadius = 6378137; // meters

  let total = 0;
  for (let i = 0, l = latlngs.length; i < l; i++) {
    const [lat1, lon1] = latlngs[i];
    const [lat2, lon2] = latlngs[(i + 1) % l];

    total +=
      toRadians(lon2 - lon1) *
      (2 + Math.sin(toRadians(lat1)) + Math.sin(toRadians(lat2)));
  }

  total = Math.abs((total * earthRadius * earthRadius) / 2);

  return formatArea(total);
}

/**
 * Format area value to human-readable string
 * @param area - Area in square meters
 * @returns Formatted string (e.g., "123.45 m²" or "1.23 km²")
 */
export function formatArea(area: number): string {
  if (area >= 1000000) {
    return `${(area / 1000000).toFixed(2)} km²`;
  } else {
    return `${area.toFixed(2)} m²`;
  }
}

/**
 * Format distance value to human-readable string
 * @param distance - Distance in meters
 * @returns Formatted string (e.g., "123.45 m" or "1.23 km")
 */
export function formatDistance(distance: number): string {
  if (distance >= 1000) {
    return `${(distance / 1000).toFixed(2)} km`;
  } else {
    return `${distance.toFixed(2)} m`;
  }
}

/**
 * Calculate and format distance for a Leaflet polyline/polygon layer
 * @param layer - Leaflet Polyline or Polygon layer
 * @returns Formatted distance string
 */
export function updateDistance(layer: L.Polyline | L.Polygon): string {
  const isLine = layer.toGeoJSON().geometry.type === "LineString";
  const latlngsRaw = isLine
    ? layer.getLatLngs()
    : (layer as L.Polygon).getLatLngs()[0];

  // Type guard: ensure we have LatLng[]
  let latlngs: L.LatLng[];
  if (Array.isArray(latlngsRaw)) {
    latlngs = latlngsRaw as L.LatLng[];
  } else {
    latlngs = [latlngsRaw as L.LatLng];
  }

  if (!isLine) {
    latlngs.push(latlngs[0]); // Close polygon
  }

  const totalDistance = calculateDistance(latlngs);

  if (!isLine) {
    latlngs.pop(); // Remove duplicate closing point
  }

  return formatDistance(totalDistance);
}

/**
 * Calculate and format distance from array of coordinate pairs
 * @param coordinates - Array of [lat, lng] pairs
 * @returns Formatted distance string
 */
export function updateDistanceByLatLngs(coordinates: number[][]): string {
  let totalDistance = 0;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const point1 = L.latLng(coordinates[i][0], coordinates[i][1]);
    const point2 = L.latLng(coordinates[i + 1][0], coordinates[i + 1][1]);
    const distance = point1.distanceTo(point2);
    totalDistance += distance;
  }

  return formatDistance(totalDistance);
}
