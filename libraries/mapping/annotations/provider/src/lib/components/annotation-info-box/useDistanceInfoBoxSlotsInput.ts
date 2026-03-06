import { useMemo } from "react";

import type {
  AnnotationEntry,
  AnnotationMode,
} from "@carma-mapping/annotations/cesium";
import { useCesiumAnnotations } from "@carma-mapping/annotations/cesium";
import { useAnnotationMeasurements } from "@carma-mapping/annotations/core";
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
      measurementMode,
      isDistanceModeLivePreviewActive,
      pointMeasurements,
      displayMeasurement,
      currentMeasurement,
    } = useAnnotationInfoBoxDisplaySelection();
    const {
      activeMeasurementId,
      referencePoint,
      hasDistancePreviewAnchor,
      distanceRelations,
      pointMarkerBadgeByPointId,
    } = useCesiumAnnotations();
    const { getMeasurementOrderByType, getNextMeasurementOrderByType } =
      useAnnotationMeasurements<AnnotationMode, AnnotationEntry>();
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
          measurementMode,
          measurement: displayMeasurement,
          activeMeasurementId,
          pointMeasurements,
          referencePoint,
          hasDistancePreviewAnchor,
          distanceRelations,
          pointMarkerBadgeByPointId,
          getMeasurementOrderByType,
          getNextMeasurementOrderByType,
          actions,
        }).slotsInput,
      [
        actions,
        activeMeasurementId,
        displayMeasurement,
        distanceRelations,
        getMeasurementOrderByType,
        getNextMeasurementOrderByType,
        hasDistancePreviewAnchor,
        measurementMode,
        pointMarkerBadgeByPointId,
        pointMeasurements,
        referencePoint,
      ]
    );

    return {
      isDistanceKind: isDistanceModeLivePreviewActive || isDistanceMeasurement,
      slotsInput,
      currentMeasurementId: currentMeasurement?.id ?? null,
    };
  };
