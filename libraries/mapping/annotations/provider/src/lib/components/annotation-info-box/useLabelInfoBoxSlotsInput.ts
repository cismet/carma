import { useMemo } from "react";

import {
  isPointMeasurementEntry,
  type AnnotationEntry,
  type AnnotationMode,
  type PointMeasurementEntry,
  useAnnotations,
} from "@carma-mapping/annotations/core";
import type { LabelAnnotationSlotsInput } from "./getAnnotationInfoBoxSlots";
import { getLabelAnnotationSlotsInput } from "./getLabelAnnotationSlotsInput";
import { useAnnotationInfoBoxDisplaySelection } from "./useAnnotationInfoBoxDisplaySelection";
import { useAnnotationInfoBoxSlotActions } from "./useAnnotationInfoBoxSlotActions";

export type LabelInfoBoxSlotsInputState = {
  isLabelKind: boolean;
  slotsInput: LabelAnnotationSlotsInput;
  labelMeasurements: ReadonlyArray<PointMeasurementEntry>;
  currentMeasurementId: string | null;
};

export const useLabelInfoBoxSlotsInput = (): LabelInfoBoxSlotsInputState => {
  const { displayMeasurement } = useAnnotationInfoBoxDisplaySelection();
  const { annotationsByType, labelInputPromptPointId } = useAnnotations<
    AnnotationMode,
    AnnotationEntry
  >();
  const actions = useAnnotationInfoBoxSlotActions();

  const displayLabelMeasurement =
    displayMeasurement && isPointMeasurementEntry(displayMeasurement)
      ? displayMeasurement
      : null;

  const labelMeasurements = useMemo(
    () => annotationsByType("pointLabel").filter(isPointMeasurementEntry),
    [annotationsByType]
  );

  const labelState = useMemo(
    () =>
      getLabelAnnotationSlotsInput({
        measurement: displayLabelMeasurement,
        labelMeasurements,
        labelInputPromptPointId,
        actions,
      }),
    [
      actions,
      displayLabelMeasurement,
      labelInputPromptPointId,
      labelMeasurements,
    ]
  );

  return {
    isLabelKind: labelState.isLabelCandidate || labelState.isLabelMeasurement,
    slotsInput: labelState.slotsInput,
    labelMeasurements,
    currentMeasurementId: displayLabelMeasurement?.id ?? null,
  };
};
