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

const ANNOTATION_TOOL_TYPES = [SELECT_TOOL_TYPE, ...ANNOTATION_TYPES] as const;
export type AnnotationToolType = (typeof ANNOTATION_TOOL_TYPES)[number];
