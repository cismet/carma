export const POINT_LABEL_METRIC_MODES = [
  "elevation",
  "absoluteElevation",
  "none",
  "distance",
] as const;

export type PointLabelMetricMode = (typeof POINT_LABEL_METRIC_MODES)[number];

export const DEFAULT_POINT_LABEL_METRIC_MODE: PointLabelMetricMode =
  "elevation";

export type AnnotationLabelAnchor = {
  anchorPointId: string;
  compactContent?: string;
  collapseToCompact: boolean;
};

export type AnnotationLabelAppearance = {
  fontSizePx?: number;
  backgroundColor?: string;
  textColor?: string;
};
