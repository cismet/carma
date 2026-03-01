import type {
  AnnotationSlots,
  PointAnnotationSlotsInput,
} from "./annotationInfoBoxSlots.types";
import {
  POINT_MODE_INSTRUCTION,
  POINT_TITLE,
  getPointTitleToken,
  renderEditableAnnotationSubtitle,
  renderRelativeElevationContent,
} from "./annotationInfoBoxSlots.shared";

export const getPointAnnotationInfoBoxSlots = (
  input: PointAnnotationSlotsInput
): AnnotationSlots => ({
  headingTitle:
    input.measurement || !input.isLivePreview
      ? POINT_TITLE
      : `${POINT_TITLE} (Neu)`,
  subtitle: renderEditableAnnotationSubtitle({
    annotationTypeTitle: POINT_TITLE,
    titleToken: getPointTitleToken(input),
    measurement: input.measurement,
    displayPoint: input.displayPoint,
    isReference: input.isReference,
    actions: input.actions,
  }),
  content: renderRelativeElevationContent(input.relativeElevation),
  collapsible: Boolean(input.measurement || input.isLivePreview),
  instructionText: input.isLivePreview ? POINT_MODE_INSTRUCTION : null,
});
