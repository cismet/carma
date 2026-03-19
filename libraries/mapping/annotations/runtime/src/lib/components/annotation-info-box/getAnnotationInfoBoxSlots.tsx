import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
} from "@carma-mapping/annotations/core";
import {
  getDistanceAnnotationInfoBoxSlots,
  getGenericAnnotationInfoBoxSlots,
  getLabelAnnotationInfoBoxSlots,
  getNodeChainAnnotationInfoBoxSlots,
  getPointAnnotationInfoBoxSlots,
} from "./content-generators";
import type {
  AnnotationSlots,
  AnnotationInfoBoxEntryPayload,
} from "./annotationInfoBoxSlots.types";

export type {
  AnnotationInfoBoxEntryPayload,
  AnnotationDisplayPoint,
  AnnotationSlotActions,
  AnnotationSlotKind,
  AnnotationSlots,
  DistanceTableRow,
  PolylineSummary,
} from "./annotationInfoBoxSlots.types";

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
