import type { Feature, FeatureCollection, Geometry } from "geojson";

/**
 * Extract all linear rings from a GeoJSON geometry
 * Returns array of rings, where each ring is an array of [lon, lat] coordinates
 */
export const extractRingsFromGeometry = (geometry: Geometry): number[][][] => {
  switch (geometry.type) {
    case "Polygon":
      // Return all rings (outer + holes)
      return geometry.coordinates;
    case "MultiPolygon":
      // Flatten all polygons, return all their rings
      return geometry.coordinates.flatMap((polygon) => polygon);
    case "LineString":
      // Treat as single ring
      return [geometry.coordinates];
    case "MultiLineString":
      // Each line is a ring
      return geometry.coordinates;
    default:
      return [];
  }
};

/**
 * Extract all linear rings from a GeoJSON Feature or FeatureCollection
 * Returns array of rings, where each ring is an array of [lon, lat] coordinates
 */
export const extractAllRings = (
  geojson: Feature | FeatureCollection
): number[][][] => {
  if (geojson.type === "FeatureCollection") {
    return geojson.features.flatMap((feature) =>
      feature.geometry ? extractRingsFromGeometry(feature.geometry) : []
    );
  }

  if (geojson.geometry) {
    return extractRingsFromGeometry(geojson.geometry);
  }

  return [];
};
