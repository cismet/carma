import { isNavigableMeasurementToolType } from "../../config/navigableMeasurementToolTypes";
import type { RuntimeAnnotationInfoBoxContext } from "./annotationInfoBox.types";

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
    isNavigableMeasurementToolType(annotationEntry.toolType)
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
