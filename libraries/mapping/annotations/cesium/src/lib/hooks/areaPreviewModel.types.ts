import { type PointAnnotationEntry } from "../types/AnnotationTypes";

export type PointMarkerBadge = {
  text: string;
  backgroundColor?: string;
  textColor?: string;
};

export type DistanceLivePreviewLine = {
  anchorPointECEF: PointAnnotationEntry["geometryECEF"];
  targetPointECEF: PointAnnotationEntry["geometryECEF"];
  showDirectLine: boolean;
  showVerticalLine: boolean;
  showHorizontalLine: boolean;
};
