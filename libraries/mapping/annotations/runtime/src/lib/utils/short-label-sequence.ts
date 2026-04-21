import {
  ANNOTATION_SHORT_LABEL_COUNTER_STYLES,
  DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG,
  formatMeasurementShortLabelToken,
  fromAlphabeticSequence,
  type AnnotationType,
  ANNOTATION_TYPES,
} from "@carma-mapping/annotations/core";
import type { StoredAnnotation } from "../store/annotations-store.types";
const {
  AREA_GROUND: ANNOTATION_TYPE_AREA_GROUND,
  AREA_PLANAR: ANNOTATION_TYPE_AREA_PLANAR,
  AREA_VERTICAL: ANNOTATION_TYPE_AREA_VERTICAL,
  DISTANCE: ANNOTATION_TYPE_DISTANCE,
  LABEL: ANNOTATION_TYPE_LABEL,
  POINT: ANNOTATION_TYPE_POINT,
  POLYLINE: ANNOTATION_TYPE_POLYLINE,
} = ANNOTATION_TYPES;

export const RUNTIME_SHORT_LABEL_KINDS = new Set<AnnotationType>([
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POLYLINE,
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_LABEL,
]);

export const isShortLabelKind = (
  toolType: string
): toolType is AnnotationType =>
  RUNTIME_SHORT_LABEL_KINDS.has(toolType as AnnotationType);

const parseShortLabelCounter = (
  kind: AnnotationType,
  shortLabel: string | undefined
): number | null => {
  const normalizedShortLabel = shortLabel?.trim();
  if (!normalizedShortLabel) {
    return null;
  }

  const config = DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG[kind];
  if (!normalizedShortLabel.startsWith(config.prefix)) {
    return null;
  }

  const counterToken = normalizedShortLabel.slice(config.prefix.length).trim();
  if (!counterToken) {
    return null;
  }

  if (config.counterStyle === ANNOTATION_SHORT_LABEL_COUNTER_STYLES.NUMERIC) {
    const value = Number.parseInt(counterToken, 10);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const zeroBasedValue = fromAlphabeticSequence(counterToken);
  return zeroBasedValue === null ? null : zeroBasedValue + 1;
};

export const resolveNextShortLabelCounterByToolType = (
  annotationEntries: readonly StoredAnnotation[]
): Record<string, number> => {
  const nextCounterByToolType: Record<string, number> = {};

  for (const annotationEntry of annotationEntries) {
    if (!isShortLabelKind(annotationEntry.toolType)) {
      continue;
    }

    const counter =
      parseShortLabelCounter(
        annotationEntry.toolType,
        annotationEntry.shortLabel
      ) ?? 1;
    nextCounterByToolType[annotationEntry.toolType] = Math.max(
      nextCounterByToolType[annotationEntry.toolType] ?? 1,
      counter + 1
    );
  }

  return nextCounterByToolType;
};

export const resolveNextShortLabelCounterForToolType = ({
  annotationEntries,
  toolType,
}: {
  annotationEntries: readonly StoredAnnotation[];
  toolType: string;
}): number => {
  if (!isShortLabelKind(toolType)) {
    return 1;
  }

  return (
    resolveNextShortLabelCounterByToolType(annotationEntries)[toolType] ?? 1
  );
};

export const normalizeAnnotationShortLabels = (
  annotationEntries: readonly StoredAnnotation[]
): readonly StoredAnnotation[] => {
  const nextCounterByToolType =
    resolveNextShortLabelCounterByToolType(annotationEntries);

  return annotationEntries.map((annotationEntry) => {
    if (
      !isShortLabelKind(annotationEntry.toolType) ||
      annotationEntry.shortLabel?.trim()
    ) {
      return annotationEntry;
    }

    const nextCounter = nextCounterByToolType[annotationEntry.toolType] ?? 1;
    nextCounterByToolType[annotationEntry.toolType] = nextCounter + 1;

    return {
      ...annotationEntry,
      shortLabel: formatMeasurementShortLabelToken(
        annotationEntry.toolType,
        nextCounter
      ),
    };
  });
};
