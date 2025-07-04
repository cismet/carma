import { Cartesian3 } from "cesium";
import { VerticalDatum } from "../CRSContext";
export interface NivPoint {
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

export interface TransformedNivPoint extends NivPoint {
  longitude: number;
  latitude: number;
  cartesian: Cartesian3;
  currentElevation: number;
  verticalDatum: VerticalDatum;
  hasValidElevation: boolean;
}

export interface PointInfoData {
  title: string;
  elevation?: number;
  longitude?: number;
  latitude?: number;
  additionalInfo?: Record<string, string | number>;
  type: "terrain" | "mesh" | "nivp";
  heightDifference?: number;
  nivpData?: NivPoint;
}
