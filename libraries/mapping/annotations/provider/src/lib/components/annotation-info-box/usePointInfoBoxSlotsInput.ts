import { useMemo } from "react";

import {
  isPointMeasurementEntry,
  useAnnotations,
} from "@carma-mapping/annotations/core";
import type {
  AnnotationEntry,
  AnnotationMode,
} from "@carma-mapping/annotations/core";
import type { PointAnnotationSlotsInput } from "./getAnnotationInfoBoxSlots";
import { getPointAnnotationSlotsInput } from "./getPointAnnotationSlotsInput";
import { useAnnotationInfoBoxDisplaySelection } from "./useAnnotationInfoBoxDisplaySelection";
import { useAnnotationInfoBoxSlotActions } from "./useAnnotationInfoBoxSlotActions";
import { useAnnotationsAdapter } from "../../context/AnnotationsAdapterProvider";

export type PointInfoBoxSlotsInputState = {
  isPointKind: boolean;
  slotsInput: PointAnnotationSlotsInput;
  currentMeasurementId: string | null;
};

export const usePointInfoBoxSlotsInput = (): PointInfoBoxSlotsInputState => {
  const {
    annotationMode,
    pointLabelOnCreate,
    isPointCandidateModeActive,
    displayMeasurement,
    currentMeasurement,
  } = useAnnotationInfoBoxDisplaySelection();
  const { referencePoint } = useAnnotationsAdapter();
  const { getAnnotationOrderByType, getNextAnnotationOrderByType } =
    useAnnotations<AnnotationMode, AnnotationEntry>();
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
        annotationMode,
        pointLabelOnCreate,
        measurement: displayPointMeasurement,
        referencePoint,
        getAnnotationOrderByType,
        getNextAnnotationOrderByType,
        actions,
      }).slotsInput,
    [
      actions,
      displayPointMeasurement,
      getAnnotationOrderByType,
      getNextAnnotationOrderByType,
      annotationMode,
      pointLabelOnCreate,
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
