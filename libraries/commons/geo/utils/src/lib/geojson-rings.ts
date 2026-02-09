import type { Feature, FeatureCollection, Geometry } from "geojson";

export type ExtractRingsFromGeoJsonOptions = {
  includeLineGeometries?: boolean;
};

const extractRingsFromGeometry = (
  geometry: Geometry,
  includeLineGeometries: boolean
): number[][][] => {
  switch (geometry.type) {
    case "Polygon":
      return geometry.coordinates;
    case "MultiPolygon":
      return geometry.coordinates.flatMap((polygon) => polygon);
    case "LineString":
      return includeLineGeometries ? [geometry.coordinates] : [];
    case "MultiLineString":
      return includeLineGeometries ? geometry.coordinates : [];
    default:
      return [];
  }
};

const collectGeometriesFromGeoJson = (
  geojson: Feature | FeatureCollection
): Geometry[] => {
  if (geojson.type === "FeatureCollection") {
    return geojson.features.flatMap((feature) =>
      feature.geometry ? [feature.geometry] : []
    );
  }

  if (geojson.geometry) {
    return [geojson.geometry];
  }

  return [];
};

/**
 * Extract rings from GeoJSON (Feature or FeatureCollection).
 *
 * - Default behavior includes Polygon, MultiPolygon, LineString, MultiLineString.
 * - Set `includeLineGeometries: false` for polygon-only extraction.
 */
export const extractRingsFromGeoJson = (
  geojson: Feature | FeatureCollection,
  options: ExtractRingsFromGeoJsonOptions = {}
): number[][][] => {
  const includeLineGeometries = options.includeLineGeometries ?? true;
  return collectGeometriesFromGeoJson(geojson).flatMap((geometry) =>
    extractRingsFromGeometry(geometry, includeLineGeometries)
  );
};
