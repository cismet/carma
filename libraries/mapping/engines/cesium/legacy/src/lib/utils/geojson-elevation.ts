import { Cartographic, type CesiumTerrainProvider } from "@carma/cesium";
import type {
  Feature,
  FeatureCollection,
  Geometry,
  GeometryCollection,
  LineString,
  MultiLineString,
  MultiPoint,
  MultiPolygon,
  Point,
  Polygon,
  Position,
} from "geojson";

import { getElevationAsync } from "./elevation";

type ElevationSample = {
  key: string;
  coordinate: Position;
};

export type GeoJsonElevationOptions = {
  dedupe?: boolean;
  overrideExisting?: boolean;
  rejectOnTileFail?: boolean;
};

export type GeoJsonElevationResult = {
  geojson: Feature | FeatureCollection;
  hasAugmentedElevation: boolean;
};

const buildCoordinateKey = (coordinate: Position): string => {
  return `${coordinate[0]},${coordinate[1]}`;
};

const hasExplicitHeight = (coordinate: Position): boolean => {
  return typeof coordinate[2] === "number";
};

const collectSamplesFromGeometry = (
  geometry: Geometry,
  options: { overrideExisting: boolean },
  samples: ElevationSample[]
): void => {
  const { overrideExisting } = options;
  const collect = (coordinate: Position) => {
    if (!overrideExisting && hasExplicitHeight(coordinate)) return;
    samples.push({ key: buildCoordinateKey(coordinate), coordinate });
  };

  switch (geometry.type) {
    case "Point": {
      const point = geometry as Point;
      collect(point.coordinates as Position);
      break;
    }
    case "MultiPoint": {
      const multiPoint = geometry as MultiPoint;
      multiPoint.coordinates.forEach((coordinate) => collect(coordinate));
      break;
    }
    case "LineString": {
      const line = geometry as LineString;
      line.coordinates.forEach((coordinate) => collect(coordinate));
      break;
    }
    case "MultiLineString": {
      const multiLine = geometry as MultiLineString;
      multiLine.coordinates.forEach((lineString) => {
        lineString.forEach((coordinate) => collect(coordinate));
      });
      break;
    }
    case "Polygon": {
      const polygon = geometry as Polygon;
      polygon.coordinates.forEach((ring) => {
        ring.forEach((coordinate) => collect(coordinate));
      });
      break;
    }
    case "MultiPolygon": {
      const multiPolygon = geometry as MultiPolygon;
      multiPolygon.coordinates.forEach((polygon) => {
        polygon.forEach((ring) => {
          ring.forEach((coordinate) => collect(coordinate));
        });
      });
      break;
    }
    case "GeometryCollection": {
      const collection = geometry as GeometryCollection;
      collection.geometries.forEach((child) => {
        collectSamplesFromGeometry(child, options, samples);
      });
      break;
    }
    default:
      break;
  }
};

export const geoJsonHasMissingElevations = (
  geojson: Feature | FeatureCollection
): boolean => {
  const samples: ElevationSample[] = [];
  const features =
    geojson.type === "FeatureCollection" ? geojson.features : [geojson];

  features.forEach((feature) => {
    const geometry = feature.geometry as Geometry | null | undefined;
    if (!geometry) return;
    collectSamplesFromGeometry(geometry, { overrideExisting: false }, samples);
  });

  return samples.length > 0;
};

const applyElevationsToGeometry = (
  geometry: Geometry,
  elevationsByKey: Map<string, number>,
  options: { overrideExisting: boolean }
): Geometry => {
  const { overrideExisting } = options;
  const updateCoordinate = (coordinate: Position): Position => {
    if (!overrideExisting && hasExplicitHeight(coordinate)) {
      return coordinate;
    }
    const key = buildCoordinateKey(coordinate);
    const elevation = elevationsByKey.get(key);
    if (typeof elevation !== "number") return coordinate;
    return [coordinate[0], coordinate[1], elevation];
  };

  switch (geometry.type) {
    case "Point": {
      const point = geometry as Point;
      return {
        ...point,
        coordinates: updateCoordinate(point.coordinates as Position),
      };
    }
    case "MultiPoint": {
      const multiPoint = geometry as MultiPoint;
      return {
        ...multiPoint,
        coordinates: multiPoint.coordinates.map(updateCoordinate),
      };
    }
    case "LineString": {
      const line = geometry as LineString;
      return {
        ...line,
        coordinates: line.coordinates.map(updateCoordinate),
      };
    }
    case "MultiLineString": {
      const multiLine = geometry as MultiLineString;
      return {
        ...multiLine,
        coordinates: multiLine.coordinates.map((lineString) =>
          lineString.map(updateCoordinate)
        ),
      };
    }
    case "Polygon": {
      const polygon = geometry as Polygon;
      return {
        ...polygon,
        coordinates: polygon.coordinates.map((ring) =>
          ring.map(updateCoordinate)
        ),
      };
    }
    case "MultiPolygon": {
      const multiPolygon = geometry as MultiPolygon;
      return {
        ...multiPolygon,
        coordinates: multiPolygon.coordinates.map((polygon) =>
          polygon.map((ring) => ring.map(updateCoordinate))
        ),
      };
    }
    case "GeometryCollection": {
      const collection = geometry as GeometryCollection;
      return {
        ...collection,
        geometries: collection.geometries.map((child) =>
          applyElevationsToGeometry(child, elevationsByKey, options)
        ),
      };
    }
    default:
      return geometry;
  }
};

export const addElevationsToGeoJson = async (
  geojson: Feature | FeatureCollection,
  terrainProvider: CesiumTerrainProvider | null | undefined,
  options: GeoJsonElevationOptions = {}
): Promise<GeoJsonElevationResult> => {
  const overrideExisting = options.overrideExisting ?? false;
  const dedupe = options.dedupe ?? true;
  const rejectOnTileFail = options.rejectOnTileFail ?? true;

  if (!terrainProvider) {
    return { geojson, hasAugmentedElevation: false };
  }

  const samples: ElevationSample[] = [];
  const features =
    geojson.type === "FeatureCollection" ? geojson.features : [geojson];

  features.forEach((feature) => {
    const geometry = feature.geometry as Geometry | null | undefined;
    if (!geometry) return;
    collectSamplesFromGeometry(geometry, { overrideExisting }, samples);
  });

  if (samples.length === 0) {
    return { geojson, hasAugmentedElevation: false };
  }

  const uniqueSamples = dedupe
    ? Array.from(
        new Map(samples.map((sample) => [sample.key, sample])).values()
      )
    : samples;

  const positions = uniqueSamples.map((sample) =>
    Cartographic.fromDegrees(sample.coordinate[0], sample.coordinate[1], 0)
  );

  const results = await getElevationAsync(
    terrainProvider,
    terrainProvider,
    positions,
    rejectOnTileFail
  );

  if (results.length !== uniqueSamples.length) {
    console.warn(
      "[CESIUM|ELEVATION] elevation sampling did not match requested positions",
      {
        requested: uniqueSamples.length,
        received: results.length,
      }
    );
  }

  const elevationsByKey = new Map<string, number>();
  results.forEach((result, index) => {
    const sample = uniqueSamples[index];
    if (!sample) return;
    const height = result.surface?.height ?? result.terrain.height;
    if (typeof height === "number") {
      elevationsByKey.set(sample.key, height);
    }
  });

  if (elevationsByKey.size === 0) {
    return { geojson, hasAugmentedElevation: false };
  }

  const elevatedFeatures = features.map((feature) => {
    const geometry = feature.geometry as Geometry | null | undefined;
    if (!geometry) return feature;
    return {
      ...feature,
      geometry: applyElevationsToGeometry(geometry, elevationsByKey, {
        overrideExisting,
      }),
    };
  });

  if (geojson.type === "FeatureCollection") {
    return {
      geojson: {
        ...geojson,
        features: elevatedFeatures,
      },
      hasAugmentedElevation: true,
    };
  }

  return {
    geojson: elevatedFeatures[0] ?? geojson,
    hasAugmentedElevation: true,
  };
};
