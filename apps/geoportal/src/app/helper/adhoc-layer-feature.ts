import type { CarmaMapLibreStyleData, Layer } from "@carma/types";
import type {
  GeoJSONSourceSpecification,
  SourceSpecification,
} from "maplibre-gl";
import { DEFAULT_ADHOC_FEATURE_LAYER_ID } from "@carma-appframeworks/portals";
import md5 from "md5";
import type { Feature, FeatureCollection } from "geojson";

import { getVectorLayerStyle, isAdhocVectorLayer } from "./adhoc-feature-utils";

export type AdhocMapLibreLikeFeature = {
  id: string;
  layerId?: string;
  kind: "maplibre-style";
  data: CarmaMapLibreStyleData;
  properties?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type AddFeatureFn<
  TFeature extends AdhocMapLibreLikeFeature = AdhocMapLibreLikeFeature
> = (
  feature: TFeature,
  options?: { collectionId?: string; layerId?: string }
) => void;

type AddAdhocFeatureFromLayerOptions<
  TFeature extends AdhocMapLibreLikeFeature = AdhocMapLibreLikeFeature
> = {
  layer: Layer;
  collectionId: string;
  layerId?: string;
  addFeature: AddFeatureFn<TFeature>;
  metadata?: Record<string, unknown>;
};

type AdhocFeatureRef = {
  id: string;
  collectionId: string;
  layerId: string;
};

type AddedAdhocFeature = AdhocFeatureRef & {
  styleData: CarmaMapLibreStyleData;
};

type AdhocCollectionLike<TFeature extends { id: string }> = {
  id: string;
  features: TFeature[];
};

type AdhocSelectionTarget<TFeature extends { id: string }> = TFeature &
  Pick<AdhocFeatureRef, "collectionId" | "layerId">;

const pickNonEmptyString = (...values: Array<unknown>): string | undefined =>
  values.find(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0
  );

const pickPreferredAdhocFeature = <
  TFeature extends { id: string; kind?: string; layerId?: string }
>(
  collection: AdhocCollectionLike<TFeature> | undefined,
  preferredLayerId?: string
): TFeature | null => {
  if (!collection) {
    return null;
  }
  const featuresInPreferredLayer =
    preferredLayerId === undefined
      ? collection.features
      : collection.features.filter(
          (feature) =>
            (feature.layerId ?? DEFAULT_ADHOC_FEATURE_LAYER_ID) ===
            preferredLayerId
        );
  const sourceFeatures =
    featuresInPreferredLayer.length > 0
      ? featuresInPreferredLayer
      : collection.features;
  return (
    sourceFeatures.find((feature) => feature.kind === "maplibre-style") ??
    sourceFeatures[0] ??
    null
  );
};

export const resolveAdhocSelectionTargetByCollectionId = <
  TFeature extends { id: string; kind?: string; layerId?: string }
>(
  collections: AdhocCollectionLike<TFeature>[],
  collectionId: string,
  preferredLayerId: string = DEFAULT_ADHOC_FEATURE_LAYER_ID
): AdhocSelectionTarget<TFeature> | null => {
  const collection = collections.find(
    (candidate) => candidate.id === collectionId
  );
  const feature = pickPreferredAdhocFeature(collection, preferredLayerId);
  if (!feature) {
    return null;
  }
  return {
    ...feature,
    collectionId: collection.id,
    layerId: feature.layerId ?? preferredLayerId,
  };
};

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
  layerId,
  metadata,
}: {
  styleData: CarmaMapLibreStyleData;
  fallbackLayerId: string;
  layerId: string;
  metadata?: Record<string, unknown>;
}) => {
  const feature = {
    id: resolveAdhocFeatureId({
      styleData,
      fallbackLayerId,
    }),
    layerId,
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
  collectionId,
  layerId = DEFAULT_ADHOC_FEATURE_LAYER_ID,
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
    fallbackLayerId: `${collectionId}:${layerId}`,
    layerId,
    ...(metadata ? { metadata } : {}),
  });
  const id = adhocFeature.id;

  addFeature(adhocFeature as TFeature, { collectionId, layerId });

  return {
    id,
    collectionId,
    layerId,
    styleData,
  };
};

export const buildAdhocFallbackFeatureInfo = ({
  feature,
  collectionId,
  layerId = feature.layerId ?? DEFAULT_ADHOC_FEATURE_LAYER_ID,
}: {
  feature: AdhocMapLibreLikeFeature;
  collectionId: string;
  layerId?: string;
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
      layerId,
    },
    ...(primaryGeoJsonFeature?.geometry
      ? { geometry: primaryGeoJsonFeature.geometry }
      : {}),
  };
};
