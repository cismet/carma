import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import type {
  AnnotationSlots,
  AnnotationInfoBoxEntryPayload,
} from "./annotation-info-box-slots.types";
import {
  getDistanceAnnotationInfoBoxSlots,
  getGenericAnnotationInfoBoxSlots,
  getLabelAnnotationInfoBoxSlots,
  getNodeChainAnnotationInfoBoxSlots,
  getPointAnnotationInfoBoxSlots,
} from "./content-generators";
const {
  AREA_GROUND: ANNOTATION_TYPE_AREA_GROUND,
  AREA_PLANAR: ANNOTATION_TYPE_AREA_PLANAR,
  AREA_VERTICAL: ANNOTATION_TYPE_AREA_VERTICAL,
  DISTANCE: ANNOTATION_TYPE_DISTANCE,
  LABEL: ANNOTATION_TYPE_LABEL,
  POINT: ANNOTATION_TYPE_POINT,
  POLYLINE: ANNOTATION_TYPE_POLYLINE,
} = ANNOTATION_TYPES;

export type {
  AnnotationInfoBoxEntryPayload,
  AnnotationDisplayPoint,
  AnnotationSlotActions,
  AnnotationSlotKind,
  AnnotationSlots,
  DistanceTableRow,
  PolylineSummary,
} from "./annotation-info-box-slots.types";

export const getAnnotationInfoBoxSlots = (
  input: AnnotationInfoBoxEntryPayload
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
      return getNodeChainAnnotationInfoBoxSlots(input);
    default:
      return getGenericAnnotationInfoBoxSlots(input);
  }
};
