import md5 from "md5";
import type { Feature, FeatureCollection } from "geojson";
import type { GeoJSONSourceSpecification } from "maplibre-gl";

import type { CarmaMapLibreStyleData, FeatureInfo } from "@carma/types";

import type { AdhocFeature } from "../components/AdhocFeatureDisplayProvider";

const ADHOC_WALL_DEFAULT_HEIGHT = 20;

const isGeoJsonSource = (
  source: unknown
): source is GeoJSONSourceSpecification =>
  typeof source === "object" &&
  source !== null &&
  (source as { type?: unknown }).type === "geojson";

const hasGeoJsonFeatureId = (feature: Feature): boolean => {
  const id = feature.id;
  return typeof id === "string" || typeof id === "number";
};

const createGeneratedGeoJsonFeatureId = (
  feature: Feature,
  featureIndex: number
): string => {
  try {
    return `autogen:${md5(JSON.stringify(feature))}`;
  } catch {
    return `autogen:${md5(String(featureIndex))}`;
  }
};

const ensureGeoJsonFeatureIds = (
  geojson: Feature | FeatureCollection
): {
  geojson: Feature | FeatureCollection;
  changed: boolean;
  generatedFeatureIds: string[];
} => {
  if (geojson.type === "FeatureCollection") {
    let changed = false;
    const generatedFeatureIds: string[] = [];
    const usedIds = new Set<string>(
      geojson.features.flatMap((feature) =>
        hasGeoJsonFeatureId(feature) ? [String(feature.id)] : []
      )
    );
    const nextFeatures = geojson.features.map((feature, featureIndex) => {
      if (!hasGeoJsonFeatureId(feature)) {
        changed = true;
        const baseGeneratedFeatureId = createGeneratedGeoJsonFeatureId(
          feature,
          featureIndex
        );
        let generatedFeatureId = baseGeneratedFeatureId;
        let duplicateSuffix = 1;
        while (usedIds.has(generatedFeatureId)) {
          generatedFeatureId = `${baseGeneratedFeatureId}:${duplicateSuffix}`;
          duplicateSuffix += 1;
        }
        usedIds.add(generatedFeatureId);
        generatedFeatureIds.push(generatedFeatureId);
        return {
          ...feature,
          id: generatedFeatureId,
        };
      }
      usedIds.add(String(feature.id));
      return feature;
    });
    if (!changed) {
      return { geojson, changed: false, generatedFeatureIds: [] };
    }
    return {
      geojson: {
        ...geojson,
        features: nextFeatures,
      },
      changed: true,
      generatedFeatureIds,
    };
  }

  if (hasGeoJsonFeatureId(geojson)) {
    return { geojson, changed: false, generatedFeatureIds: [] };
  }

  const generatedFeatureId = createGeneratedGeoJsonFeatureId(geojson, 0);
  return {
    geojson: {
      ...geojson,
      id: generatedFeatureId,
    },
    changed: true,
    generatedFeatureIds: [generatedFeatureId],
  };
};

export const isAdhocMapLibreStyleFeature = (
  feature: AdhocFeature
): feature is AdhocFeature & {
  kind: "maplibre-style";
  data: CarmaMapLibreStyleData;
} => feature.kind === "maplibre-style";

export const normalizeAdhocFeatureGeoJsonFeatureIds = (
  feature: AdhocFeature
): {
  feature: AdhocFeature;
  generatedGeoJsonFeatureIds: string[];
} => {
  if (!isAdhocMapLibreStyleFeature(feature)) {
    return {
      feature,
      generatedGeoJsonFeatureIds: [],
    };
  }

  const sources = feature.data.sources;
  if (!sources) {
    return {
      feature,
      generatedGeoJsonFeatureIds: [],
    };
  }

  let hasChanges = false;
  const generatedGeoJsonFeatureIds: string[] = [];
  const normalizedSources = Object.fromEntries(
    Object.entries(sources).map(([sourceId, sourceValue]) => {
      if (
        !isGeoJsonSource(sourceValue) ||
        typeof sourceValue.data !== "object" ||
        sourceValue.data === null
      ) {
        return [sourceId, sourceValue];
      }

      const sourceData = sourceValue.data as
        | Feature
        | FeatureCollection
        | Record<string, unknown>;
      if (
        sourceData.type !== "Feature" &&
        sourceData.type !== "FeatureCollection"
      ) {
        return [sourceId, sourceValue];
      }

      const normalized = ensureGeoJsonFeatureIds(
        sourceData as Feature | FeatureCollection
      );
      if (normalized.generatedFeatureIds.length > 0) {
        generatedGeoJsonFeatureIds.push(...normalized.generatedFeatureIds);
      }
      if (!normalized.changed) {
        return [sourceId, sourceValue];
      }

      hasChanges = true;
      return [
        sourceId,
        {
          ...sourceValue,
          data: normalized.geojson,
        },
      ];
    })
  );

  if (!hasChanges) {
    return {
      feature,
      generatedGeoJsonFeatureIds,
    };
  }

  return {
    feature: {
      ...feature,
      data: {
        ...feature.data,
        sources: normalizedSources as CarmaMapLibreStyleData["sources"],
      },
    },
    generatedGeoJsonFeatureIds,
  };
};

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

export const getAdhocHeader = (feature: AdhocFeature) => {
  return (
    (typeof feature.metadata?.header === "string"
      ? feature.metadata?.header
      : undefined) ?? getMapLibreLayerInfo(feature)?.header
  );
};

export const getAdhocWallHeight = (feature: {
  metadata?: Record<string, unknown>;
}) => {
  // Check carmaConf3D.wall.height first (new preferred location)
  const carmaConf3D = feature.metadata?.carmaConf3D as
    | { wall?: { height?: number } }
    | undefined;
  if (typeof carmaConf3D?.wall?.height === "number") {
    return carmaConf3D.wall.height;
  }
  return ADHOC_WALL_DEFAULT_HEIGHT;
};

export const getGeoJsonFromFeature = (
  feature: AdhocFeature
): Feature | FeatureCollection | null => {
  if (feature.metadata?.elevatedGeoJson) {
    return feature.metadata.elevatedGeoJson as Feature | FeatureCollection;
  }
  if (isAdhocMapLibreStyleFeature(feature)) {
    const sources = feature.data.sources;
    if (!sources) return null;
    const source = Object.values(sources).find(
      (entry): entry is GeoJSONSourceSpecification =>
        isGeoJsonSource(entry) &&
        typeof entry.data === "object" &&
        entry.data !== null
    );
    if (!source) return null;
    return source.data as Feature | FeatureCollection;
  }
  return null;
};

const pickNonEmptyString = (...values: Array<unknown>) => {
  return values.find(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0
  );
};

export const buildInfoBoxStylingProps = ({
  header,
  accentColor,
  rawProps,
}: {
  header?: string;
  accentColor?: string;
  rawProps?: Record<string, unknown>;
}) => ({
  ...(accentColor ? { accentColor } : {}),
  ...(header ? { _header: header } : {}),
  wmsProps: (rawProps ?? {}) as { [key: string]: string },
});

export const buildAdhocFeatureInfo = (
  feature: AdhocFeature,
  options?: { geojsonFeature?: Feature }
): FeatureInfo | null => {
  const accentColor = getAdhocAccentColor(feature);
  const header = getAdhocHeader(feature);
  const geojson = getGeoJsonFromFeature(feature);
  if (geojson) {
    const defaultGeojsonFeature =
      geojson.type === "FeatureCollection" ? geojson.features[0] : geojson;
    const geojsonFeature = options?.geojsonFeature ?? defaultGeojsonFeature;

    const metadataTitle = pickNonEmptyString(
      typeof feature.metadata?.title === "string"
        ? feature.metadata?.title
        : undefined
    );
    const fallbackTitle = metadataTitle ?? feature.id;

    const selectedGeoJsonProperties = geojsonFeature?.properties as
      | FeatureInfo["properties"]
      | undefined;
    const hasSelectedGeoJsonFeature = options?.geojsonFeature !== undefined;
    const properties = hasSelectedGeoJsonFeature
      ? selectedGeoJsonProperties ??
        feature.properties ?? {
          title: fallbackTitle,
        }
      : feature.properties ??
        selectedGeoJsonProperties ?? {
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
    const title = hasSelectedGeoJsonFeature
      ? pickNonEmptyString(
          infoTitle,
          properties.title,
          metadataTitle,
          fallbackTitle
        )
      : pickNonEmptyString(
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
        ...buildInfoBoxStylingProps({
          header,
          accentColor,
          rawProps: geojsonFeature?.properties ?? {},
        }),
      },
      geometry: geojsonFeature?.geometry,
    };
  }

  return null;
};
