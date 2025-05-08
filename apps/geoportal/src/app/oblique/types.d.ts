import { Vector3Arr } from "types/math";
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

export type AnimationConfig = {
  duration?: number; // in ms, also max value for dynamic duration
  easingFunction?: EasingFunction.Callback;
};

export type ObliqueAnimationsConfig = {
  flyToExteriorOrientation?: AnimationConfigDynamicDuration;
  footprintExtrusion?: AnimationConfig;
};

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
  animations?: ObliqueAnimationsConfig;
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
