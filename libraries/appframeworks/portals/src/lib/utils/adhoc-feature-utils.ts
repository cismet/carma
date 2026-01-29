import { BoundingSphere, Cartesian3 } from "@carma/cesium";
import type { Feature, FeatureCollection, Geometry } from "geojson";

import type { FeatureInfo } from "@carma/types";

import type {
  AdhocFeature,
  AdhocMapLibreStyleData,
  AdhocModelData,
} from "../components/AdhocFeatureDisplayProvider";

const ADHOC_WALL_DEFAULT_HEIGHT = 15;

export const isAdhocModelFeature = (
  feature: AdhocFeature
): feature is AdhocFeature & { kind: "model"; data: AdhocModelData } =>
  feature.kind === "model";

export const isAdhocMapLibreStyleFeature = (
  feature: AdhocFeature
): feature is AdhocFeature & {
  kind: "maplibre-style";
  data: AdhocMapLibreStyleData;
} => feature.kind === "maplibre-style";

export const getMapLibreLayerInfo = (feature: AdhocFeature) => {
  if (!isAdhocMapLibreStyleFeature(feature)) return undefined;
  return feature.data.metadata?.carmaConf?.layerInfo;
};

export const getAdhocAccentColor = (feature: AdhocFeature) => {
  return (
    (typeof feature.metadata?.accentColor === "string"
      ? feature.metadata?.accentColor
      : undefined) ?? getMapLibreLayerInfo(feature)?.accentColor
  );
};

export const getAdhocWallHeight = (
  feature: { metadata?: Record<string, unknown> },
  segmentIndex: number
) => {
  const heights = feature.metadata?.wallHeights;
  if (Array.isArray(heights) && typeof heights[segmentIndex] === "number") {
    return heights[segmentIndex];
  }
  const height = feature.metadata?.wallHeightMeters;
  if (typeof height === "number") {
    return height;
  }
  return ADHOC_WALL_DEFAULT_HEIGHT;
};

export const getBoundingSphereFromCoordinates = (
  coordinates: number[][]
): BoundingSphere => {
  const points = coordinates.map((coord) =>
    Cartesian3.fromDegrees(coord[0], coord[1], coord[2] ?? 0)
  );
  return BoundingSphere.fromPoints(points);
};

export const getPolygonFromGeoJson = (
  geojson: Feature | FeatureCollection
): number[][][] | null => {
  const feature =
    geojson.type === "FeatureCollection" ? geojson.features[0] : geojson;
  const geometry = feature?.geometry as Geometry | null | undefined;
  if (!geometry) return null;

  if (geometry.type === "Polygon") {
    return geometry.coordinates as number[][][];
  }

  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates as number[][][][])[0] ?? null;
  }

  return null;
};

export const getGeoJsonFromFeature = (
  feature: AdhocFeature
): Feature | FeatureCollection | null => {
  if (isAdhocMapLibreStyleFeature(feature)) {
    const sources = feature.data.sources;
    if (!sources) return null;
    const source = Object.values(sources).find(
      (entry) => entry?.type === "geojson" && entry.data
    );
    return source?.data ?? null;
  }
  return null;
};

const pickNonEmptyString = (...values: Array<unknown>) => {
  return values.find(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0
  );
};

export const buildAdhocFeatureInfo = (
  feature: AdhocFeature
): FeatureInfo | null => {
  const geojson = getGeoJsonFromFeature(feature);
  if (geojson) {
    const geojsonFeature =
      geojson.type === "FeatureCollection" ? geojson.features[0] : geojson;

    const metadataTitle = pickNonEmptyString(
      typeof feature.metadata?.title === "string"
        ? feature.metadata?.title
        : undefined,
      getMapLibreLayerInfo(feature)?.title
    );
    const fallbackTitle = metadataTitle ?? feature.id;

    const properties = feature.properties ??
      (geojsonFeature?.properties as FeatureInfo["properties"] | undefined) ?? {
        title: fallbackTitle,
      };
    const info =
      typeof (properties as { info?: unknown }).info === "object" &&
      (properties as { info?: unknown }).info
        ? (
            properties as {
              info?: {
                title?: unknown;
                subtitle?: unknown;
                additionalInfo?: unknown;
              };
            }
          ).info
        : undefined;
    const infoTitle = pickNonEmptyString(info?.title);
    const infoSubtitle = pickNonEmptyString(info?.subtitle);
    const infoAdditionalInfo = pickNonEmptyString(info?.additionalInfo);
    const title = pickNonEmptyString(
      metadataTitle,
      properties.title,
      infoTitle,
      fallbackTitle
    );
    const subtitle = pickNonEmptyString(properties.subtitle, infoSubtitle);
    const additionalInfo = pickNonEmptyString(
      properties.additionalInfo,
      infoAdditionalInfo
    );

    return {
      id: feature.id,
      properties: {
        ...properties,
        title: title ?? fallbackTitle,
        ...(subtitle ? { subtitle } : {}),
        ...(additionalInfo ? { additionalInfo } : {}),
        adhocFeatureId: feature.id,
      },
      geometry: geojsonFeature?.geometry,
    };
  }

  if (feature.kind === "model") {
    const metadataTitle = pickNonEmptyString(
      typeof feature.metadata?.title === "string"
        ? feature.metadata?.title
        : undefined,
      getMapLibreLayerInfo(feature)?.title
    );
    const fallbackTitle = metadataTitle ?? feature.id;
    return {
      id: feature.id,
      properties: {
        ...(feature.properties ?? { title: fallbackTitle }),
        title: metadataTitle ?? feature.properties?.title ?? fallbackTitle,
        adhocFeatureId: feature.id,
      },
    };
  }

  return null;
};
