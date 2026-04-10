export const POINT_LABEL_ATTACH = {
  LEFT: "left",
  RIGHT: "right",
  CENTER: "center",
} as const;

export type PointLabelAttach =
  (typeof POINT_LABEL_ATTACH)[keyof typeof POINT_LABEL_ATTACH];

export const POINT_LABEL_ATTACHES = [
  POINT_LABEL_ATTACH.LEFT,
  POINT_LABEL_ATTACH.RIGHT,
  POINT_LABEL_ATTACH.CENTER,
] as const;
