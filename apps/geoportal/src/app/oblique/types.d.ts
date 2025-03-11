import { OBLIQUE_PREVIEW_QUALITY } from "./constants";

export type ExteriorOrientationOPK = {
  omega: number; // in radians
  phi: number; // in radians
  kappa: number; // in radians
};
export type ExteriorPosition = {
  x: number;
  y: number;
  z: number;
};

export interface BasicObliqueImageRecord {
  id: string;
  cameraId: string;
  locationNumber: number;
  lineNumber: string;
  waypointNumber: string;
  waypointId: string;
  perspectiveCenter: ExteriorPosition;
  orientation: ExteriorOrientationOPK;

  __debugRecord?: string;
}

export type CardinalDirection = "N" | "E" | "S" | "W";

export interface ObliqueImageRecord extends BasicObliqueImageRecord {
  centerWGS84: [number, number, number];
  fallbackHeading: number;
  sector: CardinalDirection;
  cartesian: Cartesian3;
  hpr: HeadingPitchRoll;
  quaternion: Quaternion;
  rotationMatrix: Matrix3;
}

export interface ObliqueDataProviderConfig {
  uri: string;
  crs: string;
  previewPath: string;
  previewQualityLevel?: OBLIQUE_PREVIEW_QUALITY;
  fixedPitch?: number;
  fixedHeight?: number;
  minFov?: number;
  maxFov?: number;
  headingOffset?: number;
}
