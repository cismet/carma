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

type row3 = [number, number, number]; 

export interface ExteriorOrientationDataArray {
  [number, number, number, row3, row3, row3];
}
export interface ExteriorOrientations {
  [key: string]: ExteriorOrientationDataArray;
}


// TODO: consolidate with type ExteriorOrientationRecord
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

export interface ObliqueImageRecord extends BasicObliqueImageRecord {
  centerWGS84: [number, number, number];
  fallbackHeading: number;
  sector: CardinalDirectionEnum;
  cartesian: Cartesian3;
  hpr: HeadingPitchRoll;
  quaternion: Quaternion;
  rotationMatrix: Matrix3;
}

// small utility format for json

export type ExteriorOrientationRecord = {
  id: string;
  x: number;
  y: number;
  z: number;
  m: Matrix3RowMajor;
};

export type NearestObliqueImageRecord = {
  record: ObliqueImageRecord;
  distanceOnGround: number;
  distanceToCamera: number;
  imageCenter: Omit<PointWithSector, "id">;
};

export type ObliqueImageRecordMap = Map<string, ObliqueImageRecord>;

export interface ObliqueDataProviderConfig {
  orientationsURI: string;
  exteriorOrientationsURI: string;
  footprintsURI: string;
  crs: string;
  previewPath: string;
  previewQualityLevel?: OBLIQUE_PREVIEW_QUALITY;
  fixedPitch?: number;
  fixedHeight?: number;
  minFov?: number;
  maxFov?: number;
  headingOffset?: number;
}

export interface PointWithSector {
  id: string;
  x: number;
  y: number;
  longitude: number;
  latitude: number;
  cardinal: CardinalDirectionEnum;
}

export interface Proj4Converter {
  converter: Converter;
  sourceCrs: string;
  targetCrs: string;
}
