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




