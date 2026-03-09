import type { AnnotationInfoBoxPayload } from "./AnnotationInfo.types";
import { AnnotationInfoBoxNavigation } from "./AnnotationInfoBoxNavigation";
import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
} from "@carma-mapping/annotations/core";
import {
  getAnnotationInfoBoxSlots,
  type AnnotationSlotKind,
  type AnnotationSlotsInput,
} from "./getAnnotationInfoBoxSlots";
import { useAnnotationInfoBoxNavigationBindings } from "./useAnnotationInfoBoxNavigationBindings";
import { useAnnotationInfoNavigationState } from "./useAnnotationInfoNavigationState";
import { useDistanceInfoBoxSlotsInput } from "./useDistanceInfoBoxSlotsInput";
import { useLabelInfoBoxSlotsInput } from "./useLabelInfoBoxSlotsInput";
import { usePlanarInfoBoxSlotsInput } from "./usePlanarInfoBoxSlotsInput";
import { usePointInfoBoxSlotsInput } from "./usePointInfoBoxSlotsInput";

type UseAnnotationInfoBoxPayloadParams = {
  pixelWidth: number;
};

export const useAnnotationInfoBoxPayload = ({
  pixelWidth,
}: UseAnnotationInfoBoxPayloadParams): AnnotationInfoBoxPayload => {
  const distanceState = useDistanceInfoBoxSlotsInput();
  const pointState = usePointInfoBoxSlotsInput();
  const labelState = useLabelInfoBoxSlotsInput();
  const planarState = usePlanarInfoBoxSlotsInput();

  const annotationType: AnnotationSlotKind = distanceState.isDistanceKind
    ? ANNOTATION_TYPE_DISTANCE
    : pointState.isPointKind
    ? ANNOTATION_TYPE_POINT
    : labelState.isLabelKind
    ? ANNOTATION_TYPE_LABEL
    : planarState.slotsInput?.kind ?? "unsupported";

  const slotsInput: AnnotationSlotsInput =
    annotationType === ANNOTATION_TYPE_DISTANCE
      ? distanceState.slotsInput
      : annotationType === ANNOTATION_TYPE_POINT
      ? pointState.slotsInput
      : annotationType === ANNOTATION_TYPE_LABEL
      ? labelState.slotsInput
      : annotationType === ANNOTATION_TYPE_POLYLINE ||
        annotationType === ANNOTATION_TYPE_AREA_GROUND ||
        annotationType === ANNOTATION_TYPE_AREA_PLANAR ||
        annotationType === ANNOTATION_TYPE_AREA_VERTICAL
      ? planarState.slotsInput ?? { kind: "unsupported" }
      : { kind: "unsupported" };

  const {
    navigationMeasurements,
    currentNavigationId,
    handleNavigationSelection,
    handleNavigationFlyTo,
    onFlyToAllMeasurements,
  } = useAnnotationInfoBoxNavigationBindings({
    annotationType,
    currentMeasurementId:
      annotationType === ANNOTATION_TYPE_DISTANCE
        ? distanceState.currentMeasurementId
        : annotationType === ANNOTATION_TYPE_POINT
        ? pointState.currentMeasurementId
        : annotationType === ANNOTATION_TYPE_LABEL
        ? labelState.currentMeasurementId
        : distanceState.currentMeasurementId,
    labelMeasurements: labelState.labelMeasurements,
  });

  const {
    currentIndex,
    totalEntries,
    onPreviousMeasurement,
    onNextMeasurement,
  } = useAnnotationInfoNavigationState({
    navigationMeasurements,
    currentMeasurementId: currentNavigationId,
    onSelectMeasurementById: handleNavigationSelection,
    onFlyToMeasurementById: handleNavigationFlyTo,
    onFlyToAllMeasurements,
  });

  const slots = getAnnotationInfoBoxSlots(slotsInput);

  return {
    pixelWidth,
    headingColor: "rgba(59, 130, 246, 0.7)",
    headingTitle: slots.headingTitle,
    headingActions: slots.headingActions,
    collapsible: slots.collapsible,
    footer: (
      <AnnotationInfoBoxNavigation
        totalEntries={totalEntries}
        currentIndex={currentIndex}
        instructionText={slots.instructionText}
        onFlyToAllMeasurements={onFlyToAllMeasurements}
        onPreviousMeasurement={onPreviousMeasurement}
        onNextMeasurement={onNextMeasurement}
      />
    ),
    subtitle: slots.subtitle,
    content: slots.content,
  };
};
