import { Cartesian3, type Cartographic } from "@carma/cesium";

export enum MeasurementMode {
  NONE = "none",
  PointQuery = "point_query",
  Traverse = "traverse",
  Elevation = "elevation",
}

export type PointLabelMetricMode = "elevation" | "none" | "distance";
export const DEFAULT_POINT_LABEL_METRIC_MODE: PointLabelMetricMode =
  "elevation";

export type GeomPoint = Partial<Cartographic> & {
  longitude: number;
  latitude: number;
  height: number;
};

type GeomPolyline = GeomPoint[];

export type MeasurementEntry = {
  id: string;
  type: MeasurementMode;
  timestamp: number;
  index?: number;
  name?: string;
  geometryECEF: Cartesian3[] | Cartesian3;
  geometryWGS84: GeomPoint | GeomPolyline;
  metadata?: unknown;
  derived?: unknown;
  temporary?: boolean;
  pointLabelMode?: PointLabelMetricMode;
};

export type PointMeasurementEntry = MeasurementEntry & {
  type: MeasurementMode.PointQuery;
  geometryECEF: Cartesian3;
  geometryWGS84: GeomPoint;
  radius?: number;
};

export function isPointMeasurementEntry(
  entry: MeasurementEntry
): entry is PointMeasurementEntry {
  return entry && entry.type === MeasurementMode.PointQuery;
}

export type TraverseMeasurementEntry = MeasurementEntry & {
  type: MeasurementMode.Traverse;
  geometryECEF: Cartesian3[];
  geometryWGS84: GeomPolyline;
  heightOffset?: number;
  shouldRebuildEntry?: boolean;
  derived?: {
    segmentLengths: number[];
    segmentLengthsCumulative: number[];
    totalLength: number;
  };
};

export function isTraverseMeasurementEntry(
  entry: MeasurementEntry
): entry is TraverseMeasurementEntry {
  return entry && entry.type === MeasurementMode.Traverse;
}

export type MeasurementCollection = MeasurementEntry[];
