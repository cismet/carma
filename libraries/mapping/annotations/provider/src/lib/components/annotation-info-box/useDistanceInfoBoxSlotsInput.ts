import { useMemo } from "react";

import {
  useAnnotationCollection,
  useAnnotationSelectionState,
  useAnnotationViewState,
} from "../../context/AnnotationsProvider";
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
    const view = useAnnotationViewState();
    const annotations = useAnnotationCollection();
    const actions = useAnnotationInfoBoxSlotActions();

    const isDistanceMeasurement = useMemo(
      () =>
        displayMeasurement !== null &&
        view.distanceRelations.some(
          (relation) =>
            relation.pointAId === displayMeasurement.id ||
            relation.pointBId === displayMeasurement.id
        ),
      [displayMeasurement, view.distanceRelations]
    );

    const slotsInput = useMemo(
      () =>
        getDistanceAnnotationSlotsInput({
          activeToolType,
          measurement: displayMeasurement,
          activeMeasurementId: selection.activeAnnotationId,
          pointEntries,
          referencePoint: view.referencePoint,
          hasDistancePreviewAnchor: view.hasDistancePreviewAnchor,
          distanceRelations: view.distanceRelations,
          pointMarkerBadgeByPointId: view.pointMarkerBadgeByPointId,
          getAnnotationOrderByType: annotations.getOrderByType,
          getNextAnnotationOrderByType: annotations.getNextOrderByType,
          actions,
        }).slotsInput,
      [
        actions,
        activeToolType,
        annotations,
        displayMeasurement,
        pointEntries,
        selection.activeAnnotationId,
        view,
      ]
    );

    return {
      isDistanceKind: isDistanceCandidateModeActive || isDistanceMeasurement,
      slotsInput,
      currentMeasurementId: currentMeasurement?.id ?? null,
    };
  };
