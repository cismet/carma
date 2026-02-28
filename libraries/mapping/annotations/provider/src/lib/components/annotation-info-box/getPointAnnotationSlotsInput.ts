import type { Cartesian3 } from "@carma/cesium";
import type {
  AnnotationMode,
  PointAnnotationEntry,
} from "@carma-mapping/annotations/cesium";
import {
  SPATIAL_MARKUP_KIND_POINT,
  type AnnotationListType,
} from "@carma-mapping/annotations/core";
import type {
  AnnotationSlotActions,
  PointAnnotationSlotsInput,
} from "./getAnnotationInfoBoxSlots";
import {
  isReferenceMeasurement,
  resolveAnnotationDisplayPoint,
  resolveRelativeElevation,
} from "./annotationDisplayPoint";

const MODE_POINT_MEASURE: AnnotationMode = "point_measure";

type GetPointMeasurementSlotsInputParams = {
  measurementMode: AnnotationMode;
  pointLabelOnCreate: boolean;
  measurement: PointAnnotationEntry | null;
  referencePoint: Cartesian3 | null;
  getMeasurementOrderByType: (
    type: AnnotationListType<AnnotationMode>,
    id: string | null | undefined
  ) => number | null;
  getNextMeasurementOrderByType: (
    type: AnnotationListType<AnnotationMode>
  ) => number;
  actions: AnnotationSlotActions;
};

export type PointMeasurementSlotsInputResult = {
  slotsInput: PointAnnotationSlotsInput;
  isPointLivePreview: boolean;
};

export const getPointAnnotationSlotsInput = ({
  measurementMode,
  pointLabelOnCreate,
  measurement,
  referencePoint,
  getMeasurementOrderByType,
  getNextMeasurementOrderByType,
  actions,
}: GetPointMeasurementSlotsInputParams): PointMeasurementSlotsInputResult => {
  const displayPoint = resolveAnnotationDisplayPoint({
    measurement,
  });
  const isPointLivePreview =
    measurementMode === MODE_POINT_MEASURE && !pointLabelOnCreate;

  return {
    slotsInput: {
      kind: SPATIAL_MARKUP_KIND_POINT,
      measurement,
      displayPoint,
      relativeElevation: resolveRelativeElevation({
        displayPoint,
        referencePoint,
      }),
      isReference: isReferenceMeasurement({
        measurement,
        referencePoint,
      }),
      currentOrder: getMeasurementOrderByType("pointMeasure", measurement?.id),
      nextOrder: getNextMeasurementOrderByType("pointMeasure"),
      isLivePreview: isPointLivePreview,
      actions,
    },
    isPointLivePreview,
  };
};
