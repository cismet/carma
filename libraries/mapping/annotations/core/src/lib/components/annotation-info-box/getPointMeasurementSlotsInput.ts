import type { Cartesian3 } from "@carma/cesium";
import type {
  MeasurementMode,
  PointMeasurementEntry,
} from "@carma-mapping/annotations/cesium";
import { SPATIAL_MARKUP_KIND_POINT } from "../../types/measurementKindRegistry";

import type { AnnotationListType } from "../../context/AnnotationMeasurementsContext";
import type {
  MeasurementSlotActions,
  PointMeasurementSlotsInput,
} from "./getAnnotationInfoBoxSlots";
import {
  isReferenceMeasurement,
  resolveMeasurementDisplayPoint,
  resolveRelativeElevation,
} from "./measurementDisplayPoint";

const MODE_POINT_MEASURE: MeasurementMode = "point_measure";

type GetPointMeasurementSlotsInputParams = {
  measurementMode: MeasurementMode;
  pointLabelOnCreate: boolean;
  measurement: PointMeasurementEntry | null;
  referencePoint: Cartesian3 | null;
  getMeasurementOrderByType: (
    type: AnnotationListType<MeasurementMode>,
    id: string | null | undefined
  ) => number | null;
  getNextMeasurementOrderByType: (
    type: AnnotationListType<MeasurementMode>
  ) => number;
  actions: MeasurementSlotActions;
};

export type PointMeasurementSlotsInputResult = {
  slotsInput: PointMeasurementSlotsInput;
  isPointLivePreview: boolean;
};

export const getPointMeasurementSlotsInput = ({
  measurementMode,
  pointLabelOnCreate,
  measurement,
  referencePoint,
  getMeasurementOrderByType,
  getNextMeasurementOrderByType,
  actions,
}: GetPointMeasurementSlotsInputParams): PointMeasurementSlotsInputResult => {
  const displayPoint = resolveMeasurementDisplayPoint({
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
