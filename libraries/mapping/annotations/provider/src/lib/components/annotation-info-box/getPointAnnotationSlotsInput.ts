import {
  ANNOTATION_TYPE_POINT,
  type AnnotationMode,
  type AnnotationListType,
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
  annotationMode: AnnotationMode;
  pointLabelOnCreate: boolean;
  measurement: PointAnnotationEntry | null;
  referencePoint: PointAnnotationEntry["geometryECEF"] | null;
  getAnnotationOrderByType: (
    type: AnnotationListType<AnnotationMode>,
    id: string | null | undefined
  ) => number | null;
  getNextAnnotationOrderByType: (
    type: AnnotationListType<AnnotationMode>
  ) => number;
  actions: AnnotationSlotActions;
};

export type PointMeasurementSlotsInputResult = {
  slotsInput: PointAnnotationSlotsInput;
  isPointLivePreview: boolean;
};

export const getPointAnnotationSlotsInput = ({
  annotationMode,
  pointLabelOnCreate,
  measurement,
  referencePoint,
  getAnnotationOrderByType,
  getNextAnnotationOrderByType,
  actions,
}: GetPointMeasurementSlotsInputParams): PointMeasurementSlotsInputResult => {
  const displayPoint = resolvePointAnnotationDisplayPoint(measurement);
  const isPointLivePreview =
    annotationMode === ANNOTATION_TYPE_POINT && !pointLabelOnCreate;

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
      currentOrder: getAnnotationOrderByType("pointMeasure", measurement?.id),
      nextOrder: getNextAnnotationOrderByType("pointMeasure"),
      isLivePreview: isPointLivePreview,
      actions,
    },
    isPointLivePreview,
  };
};
