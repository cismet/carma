import { formatNumber } from "@carma-mapping/annotations/core";
import type {
  AnnotationSlots,
  DistanceAnnotationSlotsInput,
} from "./annotationInfoBoxSlots.types";
import {
  DISTANCE_TITLE,
  getDistanceInstructionText,
  getDistanceTitleToken,
  renderDistanceTableContent,
  renderEditableAnnotationSubtitle,
} from "./annotationInfoBoxSlots.shared";

export const getDistanceAnnotationInfoBoxSlots = (
  input: DistanceAnnotationSlotsInput
): AnnotationSlots => ({
  headingTitle:
    input.measurement || !input.isLivePreview
      ? DISTANCE_TITLE
      : `${DISTANCE_TITLE} (Neu)`,
  subtitle: renderEditableAnnotationSubtitle({
    annotationTypeTitle: DISTANCE_TITLE,
    titleToken: getDistanceTitleToken(input),
    measurement: input.measurement,
    displayPoint: input.displayPoint,
    subtitleMetaText:
      input.subtitleDirectDistanceMeters !== null
        ? `${formatNumber(input.subtitleDirectDistanceMeters)} m`
        : null,
    isReference: input.isReference,
    actions: input.actions,
  }),
  content: renderDistanceTableContent(
    input.distanceTableRows,
    input.isLivePreview,
    input.hasPreviewAnchor
  ),
  collapsible: Boolean(input.measurement || input.isLivePreview),
  instructionText: input.isLivePreview
    ? getDistanceInstructionText(input.hasPreviewAnchor)
    : null,
});
