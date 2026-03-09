import { useMemo } from "react";

import { useAnnotations } from "@carma-mapping/annotations/core";
import type {
  AnnotationEntry,
  AnnotationMode,
} from "@carma-mapping/annotations/core";
import { useAnnotationsAdapter } from "../../context/AnnotationsAdapterProvider";
import type { DistanceAnnotationSlotsInput } from "./getAnnotationInfoBoxSlots";
import { getDistanceAnnotationSlotsInput } from "./getDistanceAnnotationSlotsInput";
import { useAnnotationInfoBoxDisplaySelection } from "./useAnnotationInfoBoxDisplaySelection";
import { useAnnotationInfoBoxSlotActions } from "./useAnnotationInfoBoxSlotActions";

export type DistanceInfoBoxSlotsInputState = {
  isDistanceKind: boolean;
  slotsInput: DistanceAnnotationSlotsInput;
  currentMeasurementId: string | null;
};

export const useDistanceInfoBoxSlotsInput =
  (): DistanceInfoBoxSlotsInputState => {
    const {
      annotationMode,
      isDistanceCandidateModeActive,
      pointEntries,
      displayMeasurement,
      currentMeasurement,
    } = useAnnotationInfoBoxDisplaySelection();
    const {
      activeMeasurementId,
      referencePoint,
      hasDistancePreviewAnchor,
      distanceRelations,
      pointMarkerBadgeByPointId,
    } = useAnnotationsAdapter();
    const { getAnnotationOrderByType, getNextAnnotationOrderByType } =
      useAnnotations<AnnotationMode, AnnotationEntry>();
    const actions = useAnnotationInfoBoxSlotActions();

    const isDistanceMeasurement = useMemo(
      () =>
        displayMeasurement !== null &&
        distanceRelations.some(
          (relation) =>
            relation.pointAId === displayMeasurement.id ||
            relation.pointBId === displayMeasurement.id
        ),
      [displayMeasurement, distanceRelations]
    );

    const slotsInput = useMemo(
      () =>
        getDistanceAnnotationSlotsInput({
          annotationMode,
          measurement: displayMeasurement,
          activeMeasurementId,
          pointEntries,
          referencePoint,
          hasDistancePreviewAnchor,
          distanceRelations,
          pointMarkerBadgeByPointId,
          getAnnotationOrderByType,
          getNextAnnotationOrderByType,
          actions,
        }).slotsInput,
      [
        actions,
        activeMeasurementId,
        displayMeasurement,
        distanceRelations,
        getAnnotationOrderByType,
        getNextAnnotationOrderByType,
        hasDistancePreviewAnchor,
        annotationMode,
        pointMarkerBadgeByPointId,
        pointEntries,
        referencePoint,
      ]
    );

    return {
      isDistanceKind: isDistanceCandidateModeActive || isDistanceMeasurement,
      slotsInput,
      currentMeasurementId: currentMeasurement?.id ?? null,
    };
  };
