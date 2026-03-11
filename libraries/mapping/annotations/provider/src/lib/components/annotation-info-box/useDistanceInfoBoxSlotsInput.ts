import { useMemo } from "react";

import {
  isPointMeasurementEntry,
  type PointMeasurementEntry,
} from "@carma-mapping/annotations/core";
import {
  useAnnotationCollection,
  useDistanceAnnotationReadModel,
  useNodeChainAnnotations,
  useAnnotationSelectionState,
} from "../../context/AnnotationsProvider";
import { usePointMarkerBadgeState } from "../../context/render/point/label/usePointMarkerBadgeState";
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
      activeToolType,
      isDistanceCandidateModeActive,
      pointEntries,
      displayMeasurement,
      currentMeasurement,
    } = useAnnotationInfoBoxDisplaySelection();
    const selection = useAnnotationSelectionState();
    const distanceReadModel = useDistanceAnnotationReadModel();
    const nodeChainAnnotations = useNodeChainAnnotations();
    const annotations = useAnnotationCollection();
    const actions = useAnnotationInfoBoxSlotActions();
    const pointMeasureEntries = useMemo(
      () =>
        annotations.items.filter(
          (annotation): annotation is PointMeasurementEntry =>
            isPointMeasurementEntry(annotation)
        ),
      [annotations.items]
    );
    const { pointMarkerBadgeByPointId } = usePointMarkerBadgeState(
      pointEntries,
      pointMeasureEntries,
      nodeChainAnnotations,
      distanceReadModel.distanceRelations
    );

    const isDistanceMeasurement = useMemo(
      () =>
        displayMeasurement !== null &&
        distanceReadModel.distanceRelations.some(
          (relation) =>
            relation.pointAId === displayMeasurement.id ||
            relation.pointBId === displayMeasurement.id
        ),
      [displayMeasurement, distanceReadModel.distanceRelations]
    );

    const slotsInput = useMemo(
      () =>
        getDistanceAnnotationSlotsInput({
          activeToolType,
          measurement: displayMeasurement,
          activeMeasurementId: selection.activeAnnotationId,
          pointEntries,
          referencePoint: distanceReadModel.referencePoint,
          hasDistancePreviewAnchor: distanceReadModel.hasPreviewAnchor,
          distanceRelations: distanceReadModel.distanceRelations,
          pointMarkerBadgeByPointId,
          getAnnotationOrderByType: annotations.getOrderByType,
          getNextAnnotationOrderByType: annotations.getNextOrderByType,
          actions,
        }).slotsInput,
      [
        actions,
        activeToolType,
        annotations,
        distanceReadModel,
        displayMeasurement,
        pointMarkerBadgeByPointId,
        pointMeasureEntries,
        pointEntries,
        selection.activeAnnotationId,
      ]
    );

    return {
      isDistanceKind: isDistanceCandidateModeActive || isDistanceMeasurement,
      slotsInput,
      currentMeasurementId: currentMeasurement?.id ?? null,
    };
  };
