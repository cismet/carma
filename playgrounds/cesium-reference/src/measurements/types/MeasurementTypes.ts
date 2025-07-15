import { Cartesian3, Cartographic } from "cesium";

export enum MeasurementMode {
  NONE = "none",
  PointQuery = "point_query",
  Traverse = "traverse",
  Elevation = "elevation",
}

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
  return entry && entry.type === MeasurementMode.PointQuery;
}

export type TraverseMeasurementEntry = MeasurementEntry & {
  type: MeasurementMode.Traverse;
  geometryECEF: Cartesian3[];
  geometryWGS84: GeomPolyline;
  heightOffset?: number; // Height offset in meters for visualization
  shouldRebuildEntry?: boolean; // Flag to indicate entry needs to be rebuilt/recomputed
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
