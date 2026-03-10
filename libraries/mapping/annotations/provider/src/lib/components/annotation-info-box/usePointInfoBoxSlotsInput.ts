import { useMemo } from "react";

import { isPointMeasurementEntry } from "@carma-mapping/annotations/core";
import type { PointAnnotationSlotsInput } from "./getAnnotationInfoBoxSlots";
import { getPointAnnotationSlotsInput } from "./getPointAnnotationSlotsInput";
import { useAnnotationInfoBoxDisplaySelection } from "./useAnnotationInfoBoxDisplaySelection";
import { useAnnotationInfoBoxSlotActions } from "./useAnnotationInfoBoxSlotActions";
import {
  useAnnotationCollection,
  useReferencePoint,
} from "../../context/AnnotationsProvider";

export type PointInfoBoxSlotsInputState = {
  isPointKind: boolean;
  slotsInput: PointAnnotationSlotsInput;
  currentMeasurementId: string | null;
};

export const usePointInfoBoxSlotsInput = (): PointInfoBoxSlotsInputState => {
  const {
    activeToolType,
    isPointCandidateModeActive,
    displayMeasurement,
    currentMeasurement,
  } = useAnnotationInfoBoxDisplaySelection();
  const referencePoint = useReferencePoint();
  const annotations = useAnnotationCollection();
  const actions = useAnnotationInfoBoxSlotActions();

  const displayPointMeasurement =
    displayMeasurement && isPointMeasurementEntry(displayMeasurement)
      ? displayMeasurement
      : null;
  const currentPointMeasurement =
    currentMeasurement && isPointMeasurementEntry(currentMeasurement)
      ? currentMeasurement
      : null;

  const slotsInput = useMemo(
    () =>
      getPointAnnotationSlotsInput({
        activeToolType,
        measurement: displayPointMeasurement,
        referencePoint,
        getAnnotationOrderByType: annotations.getOrderByType,
        getNextAnnotationOrderByType: annotations.getNextOrderByType,
        actions,
      }).slotsInput,
    [
      actions,
      activeToolType,
      annotations,
      displayPointMeasurement,
      referencePoint,
    ]
  );

  const isPointKind =
    isPointCandidateModeActive ||
    (displayPointMeasurement !== null &&
      !displayPointMeasurement.auxiliaryLabelAnchor);

  return {
    isPointKind,
    slotsInput,
    currentMeasurementId: currentPointMeasurement?.id ?? null,
  };
};
