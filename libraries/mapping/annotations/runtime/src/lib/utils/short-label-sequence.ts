import {
  formatMeasurementShortLabelToken,
  type AnnotationType,
  ANNOTATION_TYPES,
} from "@carma-mapping/annotations/core";
import {
  ANNOTATION_SHORT_LABEL_SOURCES,
  type StoredAnnotation,
} from "../store/annotations-store.types";
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

const resolveDefaultShortLabelCounter = (
  annotationEntry: StoredAnnotation
): number | null => {
  if (
    annotationEntry.shortLabelSource === ANNOTATION_SHORT_LABEL_SOURCES.CUSTOM
  ) {
    return null;
  }

  const counter = annotationEntry.shortLabelCounter;
  return typeof counter === "number" && Number.isFinite(counter) && counter > 0
    ? Math.floor(counter)
    : null;
};

const resolveNextFreeShortLabelCounter = (
  usedCounters: ReadonlySet<number> | undefined
): number => {
  let nextCounter = 1;
  while (usedCounters?.has(nextCounter)) {
    nextCounter += 1;
  }
  return nextCounter;
};

const resolveUsedShortLabelCountersByToolType = (
  annotationEntries: readonly StoredAnnotation[]
): Record<string, Set<number>> => {
  const usedCountersByToolType: Record<string, Set<number>> = {};

  for (const annotationEntry of annotationEntries) {
    if (!isShortLabelKind(annotationEntry.toolType)) {
      continue;
    }

    const counter = resolveDefaultShortLabelCounter(annotationEntry);
    if (counter === null) {
      continue;
    }

    (usedCountersByToolType[annotationEntry.toolType] ??= new Set()).add(
      counter
    );
  }

  return usedCountersByToolType;
};

export const resolveNextShortLabelCounterByToolType = (
  annotationEntries: readonly StoredAnnotation[]
): Record<string, number> => {
  const usedCountersByToolType =
    resolveUsedShortLabelCountersByToolType(annotationEntries);
  const nextCounterByToolType: Record<string, number> = {};

  for (const [toolType, usedCounters] of Object.entries(
    usedCountersByToolType
  )) {
    nextCounterByToolType[toolType] =
      resolveNextFreeShortLabelCounter(usedCounters);
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
  const usedCountersByToolType =
    resolveUsedShortLabelCountersByToolType(annotationEntries);

  return annotationEntries.map((annotationEntry) => {
    if (
      !isShortLabelKind(annotationEntry.toolType) ||
      annotationEntry.shortLabel?.trim()
    ) {
      return annotationEntry;
    }

    const usedCounters =
      usedCountersByToolType[annotationEntry.toolType] ?? new Set<number>();
    usedCountersByToolType[annotationEntry.toolType] = usedCounters;
    const nextCounter = resolveNextFreeShortLabelCounter(usedCounters);
    usedCounters.add(nextCounter);

    return {
      ...annotationEntry,
      shortLabel: formatMeasurementShortLabelToken(
        annotationEntry.toolType,
        nextCounter
      ),
      shortLabelSource: ANNOTATION_SHORT_LABEL_SOURCES.DEFAULT,
      shortLabelCounter: nextCounter,
    };
  });
};
