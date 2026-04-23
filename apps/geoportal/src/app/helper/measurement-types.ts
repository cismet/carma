import type { Item } from "@carma-mapping/layers";

export const MEASUREMENT_ITEM_TYPES = {
  POINT: "point",
  DISTANCE: "distance",
  AREA: "area",
} as const;

export type MeasurementItemType =
  (typeof MEASUREMENT_ITEM_TYPES)[keyof typeof MEASUREMENT_ITEM_TYPES];

const GEOMETRY_TYPE_TO_MEASUREMENT_TYPE: Record<string, MeasurementItemType> = {
  point: MEASUREMENT_ITEM_TYPES.POINT,
  multipoint: MEASUREMENT_ITEM_TYPES.POINT,
  linestring: MEASUREMENT_ITEM_TYPES.DISTANCE,
  multilinestring: MEASUREMENT_ITEM_TYPES.DISTANCE,
  polygon: MEASUREMENT_ITEM_TYPES.AREA,
  multipolygon: MEASUREMENT_ITEM_TYPES.AREA,
};

const TYPE_LABELS: Record<MeasurementItemType, string> = {
  [MEASUREMENT_ITEM_TYPES.POINT]: "Punktmessung",
  [MEASUREMENT_ITEM_TYPES.DISTANCE]: "Distanzmessung",
  [MEASUREMENT_ITEM_TYPES.AREA]: "Flächenmessung",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const collectMeasurementTypesFromFeatureCollection = (
  featureCollection: unknown
): Set<MeasurementItemType> => {
  const measurementTypes = new Set<MeasurementItemType>();
  if (!isRecord(featureCollection)) {
    return measurementTypes;
  }

  const features = Array.isArray(featureCollection.features)
    ? featureCollection.features
    : [];

  features.forEach((feature) => {
    if (!isRecord(feature) || !isRecord(feature.geometry)) {
      return;
    }

    const geometryType = feature.geometry.type;
    if (typeof geometryType !== "string") {
      return;
    }

    const measurementType =
      GEOMETRY_TYPE_TO_MEASUREMENT_TYPE[geometryType.toLowerCase()];
    if (measurementType) {
      measurementTypes.add(measurementType);
    }
  });

  return measurementTypes;
};

export const getMeasurementTypeLabel = (
  measurementType: MeasurementItemType
): string => TYPE_LABELS[measurementType];

export const getMeasurementTypeTag = (
  measurementType: MeasurementItemType
): string => `Messung: ${getMeasurementTypeLabel(measurementType)}`;

export const getMeasurementTypeKeyword = (
  measurementType: MeasurementItemType
): string => `measurement-type:${measurementType}`;

export const resolveMeasurementTypesFromFeatureStyle = (
  featureStyle: unknown
): MeasurementItemType[] => {
  if (!isRecord(featureStyle) || !isRecord(featureStyle.sources)) {
    return [];
  }

  const measurementTypes = new Set<MeasurementItemType>();
  Object.values(featureStyle.sources).forEach((source) => {
    if (!isRecord(source) || source.type !== "geojson") {
      return;
    }
    const nestedTypes = collectMeasurementTypesFromFeatureCollection(source.data);
    nestedTypes.forEach((measurementType) => {
      measurementTypes.add(measurementType);
    });
  });

  return Array.from(measurementTypes);
};

export const resolveMeasurementTypesFromVectorStyle = (
  vectorStyle?: string
): MeasurementItemType[] => {
  if (!vectorStyle) {
    return [];
  }

  try {
    const parsed = JSON.parse(vectorStyle);
    return resolveMeasurementTypesFromFeatureStyle(parsed);
  } catch {
    return [];
  }
};

export const resolveMeasurementTypesFromItem = (
  item: Pick<Item, "vectorStyle" | "keywords">
): MeasurementItemType[] => {
  const vectorStyleTypes = resolveMeasurementTypesFromVectorStyle(
    item.vectorStyle
  );
  if (vectorStyleTypes.length > 0) {
    return vectorStyleTypes;
  }

  const keywordTypes = new Set<MeasurementItemType>();
  (item.keywords ?? []).forEach((keyword) => {
    if (typeof keyword !== "string") {
      return;
    }

    const normalized = keyword.replace("measurement-type:", "").trim();
    if (
      normalized === MEASUREMENT_ITEM_TYPES.POINT ||
      normalized === MEASUREMENT_ITEM_TYPES.DISTANCE ||
      normalized === MEASUREMENT_ITEM_TYPES.AREA
    ) {
      keywordTypes.add(normalized);
    }
  });

  return Array.from(keywordTypes);
};
