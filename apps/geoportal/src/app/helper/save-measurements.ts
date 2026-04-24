import { shapesToFeatureCollection } from "@carma-commons/measurements";
import {
  getMeasurementTypeKeyword,
  getMeasurementTypeTag,
  resolveMeasurementTypesFromFeatureStyle,
  type Item,
} from "@carma-mapping/layers";

export const DEFAULT_MEASUREMENT_EMOJI_UNIFIED = "1f4cf";

const MEASUREMENT_THUMBNAIL_URL =
  "https://wupp-digitaltwin-assets.cismet.de/v2/geoportal/thumbnails/measurements.png";
const MEASUREMENT_LEGEND_URL =
  "https://wupp-digitaltwin-assets.cismet.de/v2/geoportal/legenden/measurements.png";

export type PickedMeasurementEmoji = {
  native: string;
  unified: string;
  id: string;
};

export type SavedMeasurementFeatureData = {
  featureData: ReturnType<typeof shapesToFeatureCollection>;
  featureDescription: string;
  featureTitle: string;
};

export const resolveSavedMeasurementFeatureTitle = (title: string): string =>
  title.trim() || "Messung";

export const resolveUniqueSavedMeasurementFeatureTitle = (
  baseTitle: string,
  existingTitles: ReadonlySet<string>
): string => {
  if (!existingTitles.has(baseTitle)) {
    return baseTitle;
  }

  let counter = 1;
  while (existingTitles.has(`${baseTitle} (${counter})`)) {
    counter++;
  }
  return `${baseTitle} (${counter})`;
};

export const hashSavedMeasurementLayerContent = ({
  featureData,
  featureDescription,
  featureTitle,
  selectedUnified,
}: SavedMeasurementFeatureData & {
  selectedUnified: string;
}): string => {
  const input = `${featureTitle}|${featureDescription}|${selectedUnified}|${JSON.stringify(
    featureData
  )}`;
  let hash = 5381;

  for (let index = 0; index < input.length; index++) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }

  return (hash >>> 0).toString(36);
};

export const resolveSavedMeasurementFeatureDescription = (
  description: string
): {
  featureDescription: string;
  trimmedDescription: string;
} => {
  const trimmedDescription = description.trim();

  return {
    featureDescription: trimmedDescription
      ? `Inhalt: ${trimmedDescription}`
      : "",
    trimmedDescription,
  };
};

export const buildSavedMeasurementFeatureData = ({
  description,
  selectedUnified,
  shapes,
  title,
}: {
  description: string;
  selectedUnified: string;
  shapes: Parameters<typeof shapesToFeatureCollection>[0];
  title: string;
}): SavedMeasurementFeatureData => {
  const featureTitle = resolveSavedMeasurementFeatureTitle(title);
  const { featureDescription, trimmedDescription } =
    resolveSavedMeasurementFeatureDescription(description);
  const featureData = shapesToFeatureCollection(shapes, {
    description: trimmedDescription,
    icon: `emoji:${selectedUnified}`,
    title: featureTitle,
  });

  return { featureData, featureDescription, featureTitle };
};

export const buildSavedMeasurementLayerItem = ({
  featureData,
  featureDescription,
  featureId,
  featureTitle,
}: SavedMeasurementFeatureData & {
  featureId: string;
}): Item => {
  const layerInfo: Record<string, unknown> =
    featureData.metadata?.carmaConf?.layerInfo ?? {};
  const layerInfoTags = Array.isArray(layerInfo.tags) ? layerInfo.tags : [];
  const layerInfoKeywords = Array.isArray(layerInfo.keywords)
    ? layerInfo.keywords
    : [];
  const measurementTypes = resolveMeasurementTypesFromFeatureStyle(featureData);
  const measurementTypeTags = measurementTypes.map(getMeasurementTypeTag);
  const measurementTypeKeywords = measurementTypes.map(
    getMeasurementTypeKeyword
  );

  return {
    ...layerInfo,
    description: featureDescription,
    id: featureId,
    keywords: [...measurementTypeKeywords, ...layerInfoKeywords],
    layerType: "vector",
    serviceName: "measurements",
    tags: ["Messung", ...measurementTypeTags, ...layerInfoTags],
    thumbnail: MEASUREMENT_THUMBNAIL_URL,
    title: featureTitle,
    type: "object",
    vectorLegend: MEASUREMENT_LEGEND_URL,
    vectorStyle: JSON.stringify(featureData),
  } as Item;
};
