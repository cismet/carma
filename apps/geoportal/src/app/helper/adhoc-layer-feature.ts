import type { CarmaMapLibreStyleData, Layer } from "@carma/types";
import type {
  GeoJSONSourceSpecification,
  SourceSpecification,
} from "maplibre-gl";
import md5 from "md5";
import type { Feature, FeatureCollection } from "geojson";

import { getVectorLayerStyle, isAdhocVectorLayer } from "./adhoc-feature-utils";

export type AdhocMapLibreLikeFeature = {
  id: string;
  kind: "maplibre-style";
  data: CarmaMapLibreStyleData;
  properties?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type AddFeatureFn<
  TFeature extends AdhocMapLibreLikeFeature = AdhocMapLibreLikeFeature
> = (feature: TFeature, options?: { collectionId?: string }) => void;

export type AddAdhocFeatureFromLayerOptions<
  TFeature extends AdhocMapLibreLikeFeature = AdhocMapLibreLikeFeature
> = {
  layer: Layer;
  id: string;
  addFeature: AddFeatureFn<TFeature>;
  metadata?: Record<string, unknown>;
};

export type AddedAdhocFeature = {
  featureId: string;
  collectionId: string;
  styleData: CarmaMapLibreStyleData;
};

const pickNonEmptyString = (...values: Array<unknown>): string | undefined =>
  values.find(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0
  );

const toStringId = (value: unknown): string | null => {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return null;
};

const getFeatureIdCandidate = (feature: Feature): string | null => {
  const explicitFeatureId = toStringId(feature.id);
  if (explicitFeatureId) {
    return explicitFeatureId;
  }
  const propertiesId = toStringId(
    (feature.properties as { id?: unknown } | null | undefined)?.id
  );
  if (propertiesId) {
    return propertiesId;
  }
  return null;
};

const isGeoJsonSource = (
  source: SourceSpecification
): source is GeoJSONSourceSpecification => source.type === "geojson";

const getPrimaryGeoJson = (
  styleData: CarmaMapLibreStyleData
): Feature | FeatureCollection | null => {
  const sources = styleData.sources;
  if (!sources) {
    return null;
  }

  for (const source of Object.values(sources)) {
    if (
      !isGeoJsonSource(source) ||
      typeof source.data !== "object" ||
      source.data === null
    ) {
      continue;
    }
    const geojson = source.data as Feature | FeatureCollection;
    if (geojson.type === "Feature" || geojson.type === "FeatureCollection") {
      return geojson;
    }
  }

  return null;
};

const getPrimaryGeoJsonFeature = (
  styleData: CarmaMapLibreStyleData
): Feature | null => {
  const primaryGeoJson = getPrimaryGeoJson(styleData);
  if (!primaryGeoJson) {
    return null;
  }
  if (primaryGeoJson.type === "Feature") {
    return primaryGeoJson;
  }
  return (
    primaryGeoJson.features.find((feature): feature is Feature => !!feature) ??
    null
  );
};

const buildGeneratedFeatureId = (
  geoJson: Feature | FeatureCollection,
  fallbackLayerId: string
): string => {
  try {
    return `autogen:${fallbackLayerId}:${md5(JSON.stringify(geoJson))}`;
  } catch {
    return `autogen:${fallbackLayerId}:${md5(String(geoJson))}`;
  }
};

const resolveAdhocFeatureId = ({
  styleData,
  fallbackLayerId,
}: {
  styleData: CarmaMapLibreStyleData;
  fallbackLayerId: string;
}): string => {
  const geoJson = getPrimaryGeoJson(styleData);
  if (!geoJson) {
    return fallbackLayerId;
  }

  if (geoJson.type === "Feature") {
    return (
      getFeatureIdCandidate(geoJson) ??
      buildGeneratedFeatureId(geoJson, fallbackLayerId)
    );
  }

  const firstFeature = geoJson.features.find(
    (feature): feature is Feature => !!feature
  );
  if (!firstFeature) {
    return buildGeneratedFeatureId(geoJson, fallbackLayerId);
  }

  return (
    getFeatureIdCandidate(firstFeature) ??
    buildGeneratedFeatureId(firstFeature, fallbackLayerId)
  );
};

const extractFirstGeoJsonFeatureProperties = (
  styleData: CarmaMapLibreStyleData
): Record<string, unknown> | undefined => {
  const sources = styleData.sources as
    | Record<
        string,
        {
          type?: string;
          data?: {
            type?: string;
            features?: Array<{ properties?: Record<string, unknown> }>;
          };
        }
      >
    | undefined;

  if (!sources) {
    return undefined;
  }

  for (const source of Object.values(sources)) {
    if (source?.type === "geojson" && source.data?.features?.[0]?.properties) {
      return source.data.features[0].properties;
    }
  }

  return undefined;
};

const buildAdhocMapLibreStyleFeature = ({
  styleData,
  fallbackLayerId,
  metadata,
}: {
  styleData: CarmaMapLibreStyleData;
  fallbackLayerId: string;
  metadata?: Record<string, unknown>;
}) => {
  const feature = {
    id: resolveAdhocFeatureId({
      styleData,
      fallbackLayerId,
    }),
    kind: "maplibre-style" as const,
    data: styleData,
    properties: extractFirstGeoJsonFeatureProperties(styleData),
  };

  if (!metadata) {
    return feature;
  }

  return {
    ...feature,
    metadata,
  };
};

export const addAdhocFeatureFromLayer = async <
  TFeature extends AdhocMapLibreLikeFeature = AdhocMapLibreLikeFeature
>({
  layer,
  id,
  addFeature,
  metadata,
}: AddAdhocFeatureFromLayerOptions<TFeature>): Promise<AddedAdhocFeature | null> => {
  if (!isAdhocVectorLayer(layer)) {
    return null;
  }

  const styleData = await getVectorLayerStyle(layer);
  if (!styleData) {
    return null;
  }

  const adhocFeature = buildAdhocMapLibreStyleFeature({
    styleData,
    fallbackLayerId: id,
    ...(metadata ? { metadata } : {}),
  });
  const featureId = adhocFeature.id;
  const collectionId = id;

  addFeature(adhocFeature as TFeature, { collectionId });

  return {
    featureId,
    collectionId,
    styleData,
  };
};

export const buildAdhocFallbackFeatureInfo = ({
  feature,
  collectionId,
}: {
  feature: AdhocMapLibreLikeFeature;
  collectionId: string;
}) => {
  const rawProperties = (feature.properties ?? {}) as Record<string, unknown>;
  const info =
    typeof rawProperties.info === "object" && rawProperties.info
      ? (rawProperties.info as {
          title?: unknown;
          subtitle?: unknown;
          additionalInfo?: unknown;
        })
      : undefined;
  const metadataTitle =
    typeof feature.metadata?.title === "string"
      ? feature.metadata.title
      : undefined;
  const title =
    pickNonEmptyString(metadataTitle, info?.title, rawProperties.title) ||
    feature.id;
  const subtitle = pickNonEmptyString(rawProperties.subtitle, info?.subtitle);
  const additionalInfo = pickNonEmptyString(
    rawProperties.additionalInfo,
    info?.additionalInfo
  );

  const primaryGeoJsonFeature = getPrimaryGeoJsonFeature(feature.data);

  return {
    id: feature.id,
    properties: {
      ...rawProperties,
      title,
      ...(subtitle ? { subtitle } : {}),
      ...(additionalInfo ? { additionalInfo } : {}),
      restored: true,
      collectionId,
    },
    ...(primaryGeoJsonFeature?.geometry
      ? { geometry: primaryGeoJsonFeature.geometry }
      : {}),
  };
};
