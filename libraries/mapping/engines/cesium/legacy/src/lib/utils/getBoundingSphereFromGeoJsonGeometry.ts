import {
  getBoundingSphereFromCoordinates,
  type BoundingSphere,
  type CesiumTerrainProvider,
} from "@carma/cesium";
import type { Feature, FeatureCollection, Geometry } from "geojson";

import {
  addElevationsToGeoJson,
  type GeoJsonElevationOptions,
} from "./geojson-elevation";

export const getCoordinatesFromGeoJsonGeometry = (
  geometry: Geometry
): number[][] => {
  switch (geometry.type) {
    case "Point":
      return [geometry.coordinates as number[]];
    case "MultiPoint":
      return geometry.coordinates as number[][];
    case "LineString":
      return geometry.coordinates as number[][];
    case "MultiLineString":
      return (geometry.coordinates as number[][][]).flat();
    case "Polygon":
      return (geometry.coordinates as number[][][]).flat();
    case "MultiPolygon":
      return (geometry.coordinates as number[][][][]).flat(2);
    default:
      return [];
  }
};

export const getGeoJsonGeometryCacheKey = (geometry: Geometry): string =>
  JSON.stringify(geometry);

export const getProviderScopedCache = <T>(
  provider: CesiumTerrainProvider | null | undefined,
  providerScopedCache: WeakMap<CesiumTerrainProvider, Map<string, T>>,
  fallbackCache: Map<string, T>
): Map<string, T> => {
  if (!provider) return fallbackCache;

  let cache = providerScopedCache.get(provider);
  if (!cache) {
    cache = new Map<string, T>();
    providerScopedCache.set(provider, cache);
  }
  return cache;
};

export const getBoundingSphereFromGeoJsonGeometry = (
  geometry: Geometry
): BoundingSphere | null => {
  const coordinates = getCoordinatesFromGeoJsonGeometry(geometry);
  if (coordinates.length === 0) return null;
  return getBoundingSphereFromCoordinates(coordinates);
};

export const getCoordinatesFromGeoJson = (
  geojson: Feature | FeatureCollection
): number[][] => {
  const features =
    geojson.type === "FeatureCollection" ? geojson.features : [geojson];
  return features.flatMap((feature) => {
    const geometry = feature.geometry;
    if (!geometry) return [];
    return getCoordinatesFromGeoJsonGeometry(geometry).filter(
      (coordinate) => coordinate.length >= 2
    );
  });
};

export const getBoundingSphereFromGeoJson = (
  geojson: Feature | FeatureCollection
): BoundingSphere | null => {
  const coordinates = getCoordinatesFromGeoJson(geojson);
  if (coordinates.length === 0) return null;
  return getBoundingSphereFromCoordinates(coordinates);
};

export const getTerrainAwareBoundingSphereFromGeoJsonGeometry = async (
  geometry: Geometry,
  options: {
    terrainProvider: CesiumTerrainProvider | null | undefined;
    elevationSamplingOptions?: GeoJsonElevationOptions;
  }
): Promise<BoundingSphere | null> => {
  const { terrainProvider, elevationSamplingOptions } = options;

  let geometryWithElevations = geometry;
  if (terrainProvider) {
    try {
      const elevationResult = await addElevationsToGeoJson(
        {
          type: "Feature",
          properties: {},
          geometry,
        },
        terrainProvider,
        elevationSamplingOptions
      );

      const elevatedGeoJson = elevationResult.geojson;
      if (elevatedGeoJson.type === "Feature" && elevatedGeoJson.geometry) {
        geometryWithElevations = elevatedGeoJson.geometry;
      }
    } catch (error) {
      console.warn(
        "[CESIUM|FLYTO] Failed to sample elevations for GeoJSON geometry",
        error
      );
    }
  }

  return getBoundingSphereFromGeoJsonGeometry(geometryWithElevations);
};

export const getTerrainAwareBoundingSphereFromFeature = async (
  feature: Feature,
  options: {
    terrainProvider: CesiumTerrainProvider | null | undefined;
    elevationSamplingOptions?: GeoJsonElevationOptions;
  }
): Promise<BoundingSphere | null> => {
  if (!feature.geometry) return null;
  return getTerrainAwareBoundingSphereFromGeoJsonGeometry(
    feature.geometry,
    options
  );
};
