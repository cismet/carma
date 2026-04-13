import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  DEFAULT_ANNOTATION_SHORT_LABEL_CONFIG,
  formatMeasurementShortLabelToken,
  fromAlphabeticSequence,
  type AnnotationShortLabelKind,
} from "@carma-mapping/annotations/core";

import type { RuntimeAnnotationEntry } from "../store/annotationsStore.types";

export const RUNTIME_SHORT_LABEL_KINDS = new Set<AnnotationShortLabelKind>([
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POLYLINE,
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_LABEL,
]);

export const isRuntimeShortLabelKind = (
  toolType: string
): toolType is AnnotationShortLabelKind =>
  RUNTIME_SHORT_LABEL_KINDS.has(toolType as AnnotationShortLabelKind);

const parseShortLabelCounter = (
  kind: AnnotationShortLabelKind,
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

  if (config.counterStyle === "numeric") {
    const value = Number.parseInt(counterToken, 10);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const zeroBasedValue = fromAlphabeticSequence(counterToken);
  return zeroBasedValue === null ? null : zeroBasedValue + 1;
};

export const resolveNextShortLabelCounterByToolType = (
  annotationEntries: readonly RuntimeAnnotationEntry[]
): Record<string, number> => {
  const nextCounterByToolType: Record<string, number> = {};

  for (const annotationEntry of annotationEntries) {
    if (!isRuntimeShortLabelKind(annotationEntry.toolType)) {
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
  annotationEntries: readonly RuntimeAnnotationEntry[];
  toolType: string;
}): number => {
  if (!isRuntimeShortLabelKind(toolType)) {
    return 1;
  }

  return (
    resolveNextShortLabelCounterByToolType(annotationEntries)[toolType] ?? 1
  );
};

export const normalizeRuntimeAnnotationShortLabels = (
  annotationEntries: readonly RuntimeAnnotationEntry[]
): readonly RuntimeAnnotationEntry[] => {
  const nextCounterByToolType =
    resolveNextShortLabelCounterByToolType(annotationEntries);

  return annotationEntries.map((annotationEntry) => {
    if (
      !isRuntimeShortLabelKind(annotationEntry.toolType) ||
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
