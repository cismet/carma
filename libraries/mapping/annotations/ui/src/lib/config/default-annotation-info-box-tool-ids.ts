import {
  ANNOTATION_SELECT_TOOL_ID,
  ANNOTATION_TYPES,
  type AnnotationToolId,
} from "@carma-mapping/annotations/core";

export const DEFAULT_ANNOTATION_INFO_BOX_TOOL_IDS = [
  ANNOTATION_SELECT_TOOL_ID,
  ANNOTATION_TYPES.POINT,
  ANNOTATION_TYPES.DISTANCE,
  ANNOTATION_TYPES.POLYLINE,
  ANNOTATION_TYPES.AREA_GROUND,
  ANNOTATION_TYPES.AREA_PLANAR,
  ANNOTATION_TYPES.AREA_VERTICAL,
  ANNOTATION_TYPES.LABEL,
] as const satisfies readonly AnnotationToolId[];

/** The tools offered by default; hosts show the others only when the alltools flag is set. */
export const STABLE_ANNOTATION_TOOL_IDS = [
  ANNOTATION_SELECT_TOOL_ID,
  ANNOTATION_TYPES.POINT,
  ANNOTATION_TYPES.DISTANCE,
] as const satisfies readonly AnnotationToolId[];
