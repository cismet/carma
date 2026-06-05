export const ANNOTATION_POINT_QUERY_INPUT_MODIFIERS = {
  SHIFT: "shift",
} as const;

export type AnnotationPointQueryInputModifier =
  (typeof ANNOTATION_POINT_QUERY_INPUT_MODIFIERS)[keyof typeof ANNOTATION_POINT_QUERY_INPUT_MODIFIERS];
