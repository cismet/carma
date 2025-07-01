import { Cartesian3 } from "cesium";

export type ElevationStandard = "nhn2016" | "nhn" | "nn";
export interface NivPPoint {
  hoehe_ueber_nn: number;
  festlegungsart: number;
  lagegenauigkeit: number;
  laufende_nummer: string;
  dgk_blattnummer: string;
  messungsjahr: number;
  lagebezeichnung: string;
  geometrie: number;
  id: number;
  punktnummer_nrw: string | null;
  bemerkung: string | null;
  historisch: boolean;
  hoehe_ueber_nhn2016: number;
  hoehe_ueber_nhn: number;
  x: number;
  y: number;
  geojson: {
    type: "Point";
    crs: { type: "name"; properties: { name: "EPSG:25832" } };
    coordinates: [number, number];
  };
}

export interface TransformedNivPPoint extends NivPPoint {
  longitude: number;
  latitude: number;
  cartesian: Cartesian3;
  currentElevation: number;
  elevationStandard: ElevationStandard;
  hasValidElevation: boolean;
}

export interface PointInfoData {
  title: string;
  elevation?: number;
  longitude?: number;
  latitude?: number;
  additionalInfo?: Record<string, string | number>;
  type: "terrain" | "nivp";
  heightDifference?: number;
  nivpData?: NivPPoint;
}

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
    pointInfo?: PointInfoData;
    nivp?: NivPPoint;
    heightDifference?: number;
  };
};

export type PointMeasurementEntry = MeasurementEntry & {
  type: MeasurementMode.PointQuery;
  geometryECEF: Cartesian3;
  geometryWGS84: GeomPoint;
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
