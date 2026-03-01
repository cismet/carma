import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
} from "@carma-mapping/annotations/core";
import { getDistanceAnnotationInfoBoxSlots } from "./getDistanceAnnotationInfoBoxSlots";
import { getLabelAnnotationInfoBoxSlots } from "./getLabelAnnotationInfoBoxSlots";
import { getPlanarAnnotationInfoBoxSlots } from "./getPlanarAnnotationInfoBoxSlots";
import { getPointAnnotationInfoBoxSlots } from "./getPointAnnotationInfoBoxSlots";
import { getUnsupportedAnnotationInfoBoxSlots } from "./getUnsupportedAnnotationInfoBoxSlots";
import type {
  AnnotationSlots,
  AnnotationSlotsInput,
} from "./annotationInfoBoxSlots.types";

export type {
  AnnotationDisplayPoint,
  AnnotationSlotActions,
  AnnotationSlotKind,
  AnnotationSlots,
  AnnotationSlotsInput,
  DistanceAnnotationSlotsInput,
  DistanceTableRow,
  LabelAnnotationSlotsInput,
  PointAnnotationSlotsInput,
  PolygonPolylineAnnotationSlotsInput,
  PolylineSummary,
  UnsupportedAnnotationSlotsInput,
} from "./annotationInfoBoxSlots.types";

export const getAnnotationInfoBoxSlots = (
  input: AnnotationSlotsInput
): AnnotationSlots => {
  switch (input.kind) {
    case ANNOTATION_TYPE_POINT:
      return getPointAnnotationInfoBoxSlots(input);
    case ANNOTATION_TYPE_DISTANCE:
      return getDistanceAnnotationInfoBoxSlots(input);
    case ANNOTATION_TYPE_LABEL:
      return getLabelAnnotationInfoBoxSlots(input);
    case ANNOTATION_TYPE_POLYLINE:
    case ANNOTATION_TYPE_AREA_GROUND:
    case ANNOTATION_TYPE_AREA_PLANAR:
    case ANNOTATION_TYPE_AREA_VERTICAL:
      return getPlanarAnnotationInfoBoxSlots(input);
    default:
      return getUnsupportedAnnotationInfoBoxSlots(input);
  }
};
