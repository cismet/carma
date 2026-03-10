// Tool and annotation identifiers
export const SELECT_TOOL_TYPE = "select" as const;
export const ANNOTATION_TYPE_POINT = "point" as const;
export const ANNOTATION_TYPE_DISTANCE = "distance" as const;
export const ANNOTATION_TYPE_POLYLINE = "polyline" as const;
export const ANNOTATION_TYPE_AREA_GROUND = "area" as const;
export const ANNOTATION_TYPE_AREA_PLANAR = "planar" as const;
export const ANNOTATION_TYPE_AREA_VERTICAL = "vertical" as const;
export const ANNOTATION_TYPE_LABEL = "label" as const;

const ANNOTATION_TYPES = [
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POLYLINE,
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_LABEL,
] as const;

export type AnnotationType = (typeof ANNOTATION_TYPES)[number];
export type AnnotationShortLabelKind = AnnotationType;

export type AnnotationToolType = typeof SELECT_TOOL_TYPE | AnnotationType;

export const isAreaToolType = (
  toolType: AnnotationToolType
): toolType is
  | typeof ANNOTATION_TYPE_AREA_GROUND
  | typeof ANNOTATION_TYPE_AREA_VERTICAL
  | typeof ANNOTATION_TYPE_AREA_PLANAR =>
  toolType === ANNOTATION_TYPE_AREA_GROUND ||
  toolType === ANNOTATION_TYPE_AREA_VERTICAL ||
  toolType === ANNOTATION_TYPE_AREA_PLANAR;
