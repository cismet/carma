import { extractCarmaConfig } from "@carma-commons/utils";
import { ADHOC_LAYER_SOURCES } from "@carma-appframeworks/portals";
import {
  ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID,
  ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_VERSION,
  resolveAnnotationsRuntimePersistenceFromGeoJson,
  type AnnotationsRuntimeGeoJsonFeatureCollection,
} from "@carma-mapping/annotations/runtime";
import type { Item } from "@carma-mapping/layers";

import { buildCesiumAnnotationMeasurementId } from "./SaveCesiumAnnotations";
import {
  DEFAULT_MEASUREMENT_EMOJI_UNIFIED,
  getUniqueTitle,
  MEASUREMENT_THUMBNAIL_URL,
} from "./measurement-save-utils";

const MEASUREMENT_SERVICE_NAME = "measurements";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const parseStyleObject = (
  style: unknown
): Record<string, unknown> | null => {
  if (isRecord(style)) {
    return style;
  }
  if (typeof style !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(style);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const normalizeAnnotationsRuntimeGeoJsonFeatureCollection = (
  value: unknown
): AnnotationsRuntimeGeoJsonFeatureCollection | null => {
  const candidate = value as AnnotationsRuntimeGeoJsonFeatureCollection;
  const persistenceState =
    resolveAnnotationsRuntimePersistenceFromGeoJson(value);

  if (!persistenceState) {
    return null;
  }

  if (
    candidate?.type === "FeatureCollection" &&
    Array.isArray(candidate.features) &&
    candidate.metadata?.carmaConf?.formatId ===
      ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID &&
    candidate.metadata.carmaConf.annotationsRuntimePersistence?.formatId ===
      "annotations-runtime-persistence"
  ) {
    return candidate;
  }

  return {
    ...candidate,
    type: "FeatureCollection",
    features: candidate.features,
    metadata: {
      carmaConf: {
        formatId: ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_ID,
        formatVersion: ANNOTATIONS_RUNTIME_GEOJSON_FORMAT_VERSION,
        source: "geoportal-cesium-annotations",
        annotationsRuntimePersistence: persistenceState,
      },
    },
  };
};

const resolveAnnotationsGeoJsonFromStyleData = (
  styleData: Record<string, unknown>
): AnnotationsRuntimeGeoJsonFeatureCollection | null => {
  const styleMetadata = styleData.metadata;
  if (isRecord(styleMetadata) && isRecord(styleMetadata.carmaConf)) {
    const fromMetadata = normalizeAnnotationsRuntimeGeoJsonFeatureCollection(
      styleMetadata.carmaConf.annotationsGeoJson
    );
    if (fromMetadata) {
      return fromMetadata;
    }
  }

  const sources = styleData.sources;
  if (!isRecord(sources)) {
    return null;
  }

  for (const source of Object.values(sources)) {
    if (isRecord(source)) {
      const fromSource = normalizeAnnotationsRuntimeGeoJsonFeatureCollection(
        source.data
      );
      if (fromSource) {
        return fromSource;
      }
    }
  }

  return null;
};

export type AnnotationCarrierResolution = {
  styleData: Record<string, unknown>;
  annotationsGeoJson: AnnotationsRuntimeGeoJsonFeatureCollection;
};

/**
 * Detects whether an incoming item (for example a dropped adhoc JSON file)
 * is a saved Cesium annotation carrier. Returns the parsed style data and
 * the normalized annotations runtime GeoJSON, or `null` for generic adhoc
 * carriers, 2D measurement carriers, and items that are already saved
 * measurements.
 */
export const resolveAnnotationCarrierFromItem = (
  item: Item
): AnnotationCarrierResolution | null => {
  if (!item || item.serviceName === MEASUREMENT_SERVICE_NAME) {
    return null;
  }

  const carmaConf = extractCarmaConfig(item.keywords);
  const styleCandidate =
    carmaConf?.vectorStyle ??
    (item as Item & { vectorStyle?: unknown }).vectorStyle;
  const styleData = parseStyleObject(styleCandidate);
  if (!styleData) {
    return null;
  }

  // Carriers explicitly marked with a non-annotation source keep their
  // existing generic behavior.
  if (
    styleData.source !== undefined &&
    styleData.source !== ADHOC_LAYER_SOURCES.ANNOTATIONS
  ) {
    return null;
  }

  const annotationsGeoJson = resolveAnnotationsGeoJsonFromStyleData(styleData);
  if (!annotationsGeoJson) {
    return null;
  }

  return { styleData, annotationsGeoJson };
};

const resolveCarrierLayerInfo = (
  styleData: Record<string, unknown>
): Record<string, unknown> => {
  const styleMetadata = styleData.metadata;
  if (isRecord(styleMetadata) && isRecord(styleMetadata.carmaConf)) {
    const layerInfo = styleMetadata.carmaConf.layerInfo;
    if (isRecord(layerInfo)) {
      return layerInfo;
    }
  }
  return {};
};

const pickNonEmptyString = (...values: Array<unknown>): string | undefined =>
  values.find(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0
  );

/**
 * Builds the same saved measurement item shape as the portal save flow in
 * `SaveCesiumAnnotations` from an imported annotation carrier. When a saved
 * measurement with the same content-derived id already exists, that item is
 * returned unchanged so duplicate drops do not create duplicate entries.
 */
export const buildSavedMeasurementItemFromAnnotationCarrier = ({
  item,
  styleData,
  annotationsGeoJson,
  existingMeasurements,
}: AnnotationCarrierResolution & {
  item: Item;
  existingMeasurements: Item[];
}): Item => {
  const id = buildCesiumAnnotationMeasurementId(annotationsGeoJson);

  const existingMeasurement = existingMeasurements.find(
    (measurement) => measurement.id === id
  );
  if (existingMeasurement) {
    return existingMeasurement;
  }

  const layerInfo = resolveCarrierLayerInfo(styleData);
  const baseTitle =
    pickNonEmptyString(layerInfo.title, item.title)?.trim() || "Messung";
  const existingTitles = new Set(
    existingMeasurements.map((measurement) => measurement.title)
  );
  const title = getUniqueTitle(baseTitle, existingTitles);
  const rawDescription = pickNonEmptyString(layerInfo.description)?.trim();
  const description = rawDescription ? `Inhalt: ${rawDescription}` : "";
  const icon =
    pickNonEmptyString(layerInfo.icon) ??
    `emoji:${DEFAULT_MEASUREMENT_EMOJI_UNIFIED}`;
  const thumbnail =
    pickNonEmptyString(layerInfo.thumbnail) ?? MEASUREMENT_THUMBNAIL_URL;

  return {
    description,
    icon,
    id,
    layerType: "vector",
    metadata: {
      carmaConf: {
        annotationsGeoJson,
      },
    },
    serviceName: MEASUREMENT_SERVICE_NAME,
    tags: ["Messung", "3D-Messung"],
    keywords: [],
    thumbnail,
    title,
    type: "object",
    vectorStyle: JSON.stringify(styleData),
  } as unknown as Item;
};

type LayerUpdaterLike = (
  layer: Item,
  deleteItem?: boolean,
  forceWMS?: boolean,
  previewLayer?: boolean,
  updateExisting?: boolean
) => Promise<void> | void;

/**
 * Decorates a generic layer updater (for example the resource layer updater
 * that also receives dropped JSON files) with saved-measurement awareness:
 * incoming annotation carriers are rewritten to the portal-save measurement
 * item shape before the generic layer pipeline runs. The rewrite makes the
 * dropped carrier displayable without adding it to the persisted `Meine
 * Messungen` list. All other items pass through unchanged, so the wrapped
 * updater stays free of annotation semantics.
 */
export const withSavedMeasurementCarrierImport =
  (
    updateLayers: LayerUpdaterLike,
    { measurements }: { measurements: Item[] }
  ): LayerUpdaterLike =>
  (layer, deleteItem = false, forceWMS, previewLayer, updateExisting) => {
    if (!deleteItem) {
      const annotationCarrier = resolveAnnotationCarrierFromItem(layer);
      if (annotationCarrier) {
        const measurementItem = buildSavedMeasurementItemFromAnnotationCarrier({
          item: layer,
          ...annotationCarrier,
          existingMeasurements: measurements,
        });
        return updateLayers(
          measurementItem,
          deleteItem,
          forceWMS,
          previewLayer,
          updateExisting
        );
      }
    }

    return updateLayers(
      layer,
      deleteItem,
      forceWMS,
      previewLayer,
      updateExisting
    );
  };
