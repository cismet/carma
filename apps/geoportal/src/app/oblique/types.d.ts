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
  perspectiveCenter: ExteriorPosition;
  orientation: ExteriorOrientationOPK;
  __debugRecord?: string;
}

export interface ObliqueImageRecord extends BasicObliqueImageRecord {
  centerWGS84: [number, number, number];
  waypointId: string;
  cameraId: string | null;
  calculatedHeading?: number; // in radians
  sector?: string; // N, E, S, W
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
