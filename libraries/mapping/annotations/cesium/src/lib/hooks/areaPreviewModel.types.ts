import { type PointMeasurementEntry } from "../types/MeasurementTypes";

export type PointMarkerBadge = {
  text: string;
  backgroundColor?: string;
  textColor?: string;
};

export type DistanceLivePreviewLine = {
  anchorPointECEF: PointMeasurementEntry["geometryECEF"];
  targetPointECEF: PointMeasurementEntry["geometryECEF"];
  showDirectLine: boolean;
  showVerticalLine: boolean;
  showHorizontalLine: boolean;
};
