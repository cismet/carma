import { Cartesian3 } from "cesium";

export enum MeasurementMode {
  NONE = "none",
  PointQuery = "point_query",
  Distance = "distance",
  Elevation = "elevation",
}

type GeomPoint = {
  longitude: number;
  latitude: number;
  height: number;
};

type GeomPolyline = GeomPoint[];

export type MeasurementEntry = {
  id: string;
  type: MeasurementMode;
  timestamp: number;
  name?: string;
  geometryECEF: Cartesian3[] | Cartesian3;
  geometryWGS84: GeomPoint | GeomPolyline;
  metadata?: {
    heightDifference?: number;
  };
};

export type PointMeasurementEntry = MeasurementEntry & {
  type: MeasurementMode.PointQuery;
  geometryECEF: Cartesian3;
  geometryWGS84: GeomPoint;
  radius?: number; // Radius in meters for point query
};

export function isPointMeasurementEntry(
  entry: MeasurementEntry
): entry is PointMeasurementEntry {
  return entry.type === MeasurementMode.PointQuery;
}

export type DistanceMeasurementEntry = MeasurementEntry & {
  type: MeasurementMode.Distance;
  geometryECEF: Cartesian3[];
  geometryWGS84: GeomPolyline;
};

export function isDistanceMeasurementEntry(
  entry: MeasurementEntry
): entry is DistanceMeasurementEntry {
  return entry.type === MeasurementMode.Distance;
}

export type MeasurementCollection = MeasurementEntry[];
