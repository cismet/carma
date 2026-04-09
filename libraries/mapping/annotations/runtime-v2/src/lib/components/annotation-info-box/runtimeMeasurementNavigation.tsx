import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POINT,
} from "@carma-mapping/annotations/core";

import type { RuntimeAnnotationInfoBoxContext } from "./annotationInfoBox.types";

const NAVIGABLE_MEASUREMENT_TOOL_TYPES: ReadonlySet<string> = new Set([
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
]);

export const resolveRuntimeMeasurementNavigation = ({
  annotationEntries,
  selectedAnnotationId,
  focusAnnotationId,
  flyToAllAnnotations,
}: Pick<
  RuntimeAnnotationInfoBoxContext,
  | "annotationEntries"
  | "selectedAnnotationId"
  | "focusAnnotationId"
  | "flyToAllAnnotations"
>) => {
  const navigableEntries = annotationEntries.filter((annotationEntry) =>
    NAVIGABLE_MEASUREMENT_TOOL_TYPES.has(annotationEntry.toolType)
  );
  const currentIndex = navigableEntries.findIndex(
    (annotationEntry) => annotationEntry.id === selectedAnnotationId
  );

  if (currentIndex < 0) {
    return null;
  }

  return {
    currentIndex,
    totalEntries: navigableEntries.length,
    flyToAllMeasurements: flyToAllAnnotations,
    selectRelativeMeasurement: (offset: -1 | 1) => {
      const nextEntry =
        navigableEntries[
          (currentIndex + offset + navigableEntries.length) %
            navigableEntries.length
        ] ?? null;

      focusAnnotationId(nextEntry?.id ?? null);
    },
  };
};
