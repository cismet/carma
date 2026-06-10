import { isNavigableMeasurementAnnotationType } from "../../config/navigable-measurement-annotation-types";
import { selectAuthoringAnnotationEntries } from "../../utils/annotation-tool-collections";
import type { RuntimeAnnotationInfoBoxContext } from "./annotation-info-box.types";

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
  const navigableEntries = selectAuthoringAnnotationEntries({
    annotationEntries,
  }).filter((annotationEntry) =>
    isNavigableMeasurementAnnotationType(annotationEntry.toolType)
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
