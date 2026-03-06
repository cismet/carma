import { useMemo } from "react";

import type {
  AnnotationEntry,
  AnnotationMode,
} from "@carma-mapping/annotations/cesium";
import { useCesiumAnnotations } from "@carma-mapping/annotations/cesium";
import { useAnnotationMeasurements } from "@carma-mapping/annotations/core";
import type { PointAnnotationSlotsInput } from "./getAnnotationInfoBoxSlots";
import { getPointAnnotationSlotsInput } from "./getPointAnnotationSlotsInput";
import { useAnnotationInfoBoxDisplaySelection } from "./useAnnotationInfoBoxDisplaySelection";
import { useAnnotationInfoBoxSlotActions } from "./useAnnotationInfoBoxSlotActions";

export type PointInfoBoxSlotsInputState = {
  isPointKind: boolean;
  slotsInput: PointAnnotationSlotsInput;
  currentMeasurementId: string | null;
};

export const usePointInfoBoxSlotsInput = (): PointInfoBoxSlotsInputState => {
  const {
    measurementMode,
    pointLabelOnCreate,
    isPointModeLivePreviewActive,
    displayMeasurement,
    currentMeasurement,
  } = useAnnotationInfoBoxDisplaySelection();
  const { referencePoint } = useCesiumAnnotations();
  const { getMeasurementOrderByType, getNextMeasurementOrderByType } =
    useAnnotationMeasurements<AnnotationMode, AnnotationEntry>();
  const actions = useAnnotationInfoBoxSlotActions();

  const slotsInput = useMemo(
    () =>
      getPointAnnotationSlotsInput({
        measurementMode,
        pointLabelOnCreate,
        measurement: displayMeasurement,
        referencePoint,
        getMeasurementOrderByType,
        getNextMeasurementOrderByType,
        actions,
      }).slotsInput,
    [
      actions,
      displayMeasurement,
      getMeasurementOrderByType,
      getNextMeasurementOrderByType,
      measurementMode,
      pointLabelOnCreate,
      referencePoint,
    ]
  );

  const isPointKind =
    isPointModeLivePreviewActive ||
    (displayMeasurement !== null && !displayMeasurement.auxiliaryLabelAnchor);

  return {
    isPointKind,
    slotsInput,
    currentMeasurementId: currentMeasurement?.id ?? null,
  };
};
