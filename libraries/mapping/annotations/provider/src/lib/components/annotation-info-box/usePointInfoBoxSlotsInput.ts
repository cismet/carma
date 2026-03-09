import { useMemo } from "react";

import { useAnnotations } from "@carma-mapping/annotations/core";
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
    isPointModeLivePreviewActive,
    displayMeasurement,
    currentMeasurement,
  } = useAnnotationInfoBoxDisplaySelection();
  const { referencePoint } = useAnnotationsAdapter();
  const { getAnnotationOrderByType, getNextAnnotationOrderByType } =
    useAnnotations<AnnotationMode, AnnotationEntry>();
  const actions = useAnnotationInfoBoxSlotActions();

  const slotsInput = useMemo(
    () =>
      getPointAnnotationSlotsInput({
        annotationMode,
        pointLabelOnCreate,
        measurement: displayMeasurement,
        referencePoint,
        getAnnotationOrderByType,
        getNextAnnotationOrderByType,
        actions,
      }).slotsInput,
    [
      actions,
      displayMeasurement,
      getAnnotationOrderByType,
      getNextAnnotationOrderByType,
      annotationMode,
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
