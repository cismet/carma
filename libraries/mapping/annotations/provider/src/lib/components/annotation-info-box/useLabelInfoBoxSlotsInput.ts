import { useMemo } from "react";

import {
  isPointAnnotationEntry,
  type AnnotationEntry,
  type AnnotationMode,
  type PointAnnotationEntry,
} from "@carma-mapping/annotations/cesium";
import { useAnnotationMeasurements } from "@carma-mapping/annotations/core";
import type { LabelAnnotationSlotsInput } from "./getAnnotationInfoBoxSlots";
import { getLabelAnnotationSlotsInput } from "./getLabelAnnotationSlotsInput";
import { useAnnotationInfoBoxDisplaySelection } from "./useAnnotationInfoBoxDisplaySelection";
import { useAnnotationInfoBoxSlotActions } from "./useAnnotationInfoBoxSlotActions";

export type LabelInfoBoxSlotsInputState = {
  isLabelKind: boolean;
  slotsInput: LabelAnnotationSlotsInput;
  labelMeasurements: ReadonlyArray<PointAnnotationEntry>;
};

export const useLabelInfoBoxSlotsInput = (): LabelInfoBoxSlotsInputState => {
  const { displayMeasurement } = useAnnotationInfoBoxDisplaySelection();
  const { measurementsByType, labelInputPromptPointId } =
    useAnnotationMeasurements<AnnotationMode, AnnotationEntry>();
  const actions = useAnnotationInfoBoxSlotActions();

  const labelMeasurements = useMemo(
    () => measurementsByType("pointLabel").filter(isPointAnnotationEntry),
    [measurementsByType]
  );

  const labelState = useMemo(
    () =>
      getLabelAnnotationSlotsInput({
        measurement: displayMeasurement,
        labelMeasurements,
        labelInputPromptPointId,
        actions,
      }),
    [actions, displayMeasurement, labelInputPromptPointId, labelMeasurements]
  );

  return {
    isLabelKind: labelState.isLabelLivePreview || labelState.isLabelMeasurement,
    slotsInput: labelState.slotsInput,
    labelMeasurements,
  };
};
