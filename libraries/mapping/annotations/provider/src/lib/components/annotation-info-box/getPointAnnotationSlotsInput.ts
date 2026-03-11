import {
  ANNOTATION_TYPE_POINT,
  type AnnotationMode,
  type AnnotationToolType,
  type PointAnnotationEntry,
} from "@carma-mapping/annotations/core";
import type {
  AnnotationSlotActions,
  PointAnnotationSlotsInput,
} from "./annotationInfoBoxSlots.types";
import {
  isPointReferenceMeasurement,
  resolvePointAnnotationDisplayPoint,
  resolvePointRelativeElevation,
} from "./utils/pointAnnotationDisplay";
type GetPointMeasurementSlotsInputParams = {
  activeToolType: AnnotationToolType;
  measurement: PointAnnotationEntry | null;
  referencePoint: PointAnnotationEntry["geometryECEF"] | null;
  getAnnotationOrderByType: (
    type: AnnotationMode,
    id: string | null | undefined
  ) => number | null;
  getNextAnnotationOrderByType: (type: AnnotationMode) => number;
  actions: AnnotationSlotActions;
};

export type PointMeasurementSlotsInputResult = {
  slotsInput: PointAnnotationSlotsInput;
  isPointCandidate: boolean;
};

export const getPointAnnotationSlotsInput = ({
  activeToolType,
  measurement,
  referencePoint,
  getAnnotationOrderByType,
  getNextAnnotationOrderByType,
  actions,
}: GetPointMeasurementSlotsInputParams): PointMeasurementSlotsInputResult => {
  const displayPoint = resolvePointAnnotationDisplayPoint(measurement);
  const isPointCandidate = activeToolType === ANNOTATION_TYPE_POINT;

  return {
    slotsInput: {
      kind: ANNOTATION_TYPE_POINT,
      measurement,
      displayPoint,
      relativeElevation: resolvePointRelativeElevation(
        displayPoint,
        referencePoint
      ),
      isReference: isPointReferenceMeasurement(measurement, referencePoint),
      currentOrder: getAnnotationOrderByType(
        ANNOTATION_TYPE_POINT,
        measurement?.id
      ),
      nextOrder: getNextAnnotationOrderByType(ANNOTATION_TYPE_POINT),
      isCandidate: isPointCandidate,
      actions,
    },
    isPointCandidate,
  };
};
