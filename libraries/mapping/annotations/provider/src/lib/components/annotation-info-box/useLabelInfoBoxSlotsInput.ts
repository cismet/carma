import { useMemo } from "react";

import {
  ANNOTATION_TYPE_POINT,
  isPointMeasurementEntry,
  type PointMeasurementEntry,
} from "@carma-mapping/annotations/core";
import type { LabelAnnotationSlotsInput } from "./getAnnotationInfoBoxSlots";
import { getLabelAnnotationSlotsInput } from "./getLabelAnnotationSlotsInput";
import { useAnnotationInfoBoxDisplaySelection } from "./useAnnotationInfoBoxDisplaySelection";
import { useAnnotationInfoBoxSlotActions } from "./useAnnotationInfoBoxSlotActions";
import {
  useAnnotationCollection,
  useAnnotationTools,
} from "../../context/AnnotationsProvider";

export type LabelInfoBoxSlotsInputState = {
  isLabelKind: boolean;
  slotsInput: LabelAnnotationSlotsInput;
  labelMeasurements: ReadonlyArray<PointMeasurementEntry>;
  currentMeasurementId: string | null;
};

export const useLabelInfoBoxSlotsInput = (): LabelInfoBoxSlotsInputState => {
  const { displayMeasurement } = useAnnotationInfoBoxDisplaySelection();
  const annotations = useAnnotationCollection();
  const tools = useAnnotationTools();
  const actions = useAnnotationInfoBoxSlotActions();

  const displayLabelMeasurement =
    displayMeasurement && isPointMeasurementEntry(displayMeasurement)
      ? displayMeasurement
      : null;

  const labelMeasurements = useMemo(
    () =>
      annotations
        .byType(ANNOTATION_TYPE_POINT)
        .filter(isPointMeasurementEntry)
        .filter((measurement) => Boolean(measurement.auxiliaryLabelAnchor)),
    [annotations]
  );

  const labelState = useMemo(
    () =>
      getLabelAnnotationSlotsInput({
        measurement: displayLabelMeasurement,
        labelMeasurements,
        labelInputPromptPointId: tools.pendingLabelPlacementAnnotationId,
        actions,
      }),
    [
      actions,
      displayLabelMeasurement,
      labelMeasurements,
      tools.pendingLabelPlacementAnnotationId,
    ]
  );

  return {
    isLabelKind: labelState.isLabelCandidate || labelState.isLabelMeasurement,
    slotsInput: labelState.slotsInput,
    labelMeasurements,
    currentMeasurementId: displayLabelMeasurement?.id ?? null,
  };
};
