import {
  ANNOTATION_TYPE_DISTANCE,
  type AnnotationMode,
} from "@carma-mapping/annotations/core";

export const derivePointVisibility = (
  hideMeasurementsOfType: ReadonlySet<AnnotationMode>,
  showLabels: boolean,
  hideLabelsOfType: ReadonlySet<AnnotationMode>
) => {
  const showPoints = !hideMeasurementsOfType.has(ANNOTATION_TYPE_DISTANCE);
  const showPointLabels =
    showPoints && showLabels && !hideLabelsOfType.has(ANNOTATION_TYPE_DISTANCE);

  return {
    showPoints,
    showPointLabels,
  };
};

export const usePointVisibilityState = (
  hideMeasurementsOfType: ReadonlySet<AnnotationMode>,
  showLabels: boolean,
  hideLabelsOfType: ReadonlySet<AnnotationMode>
) =>
  derivePointVisibility(hideMeasurementsOfType, showLabels, hideLabelsOfType);
