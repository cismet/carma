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
    input.measurement || !input.isCandidate
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
    input.isCandidate,
    input.hasCandidateAnchor
  ),
  collapsible: Boolean(input.measurement || input.isCandidate),
  instructionText: input.isCandidate
    ? getDistanceInstructionText(input.hasCandidateAnchor)
    : null,
});
