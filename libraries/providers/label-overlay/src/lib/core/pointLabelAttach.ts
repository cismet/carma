export const POINT_LABEL_ATTACHES = ["left", "right", "center"] as const;

export type PointLabelAttach = (typeof POINT_LABEL_ATTACHES)[number];
