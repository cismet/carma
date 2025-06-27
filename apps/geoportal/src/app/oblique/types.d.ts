import { OBLIQUE_PREVIEW_QUALITY } from "./constants";
import type { Converter } from "proj4/dist/lib/core";

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

export interface BasicObliqueImageRecord {
  id: string;
  x: number;
  y: number;
  z: number;
  m: Matrix3RowMajor;
  cameraId: string;
  photoIndex: number;
  lineIndex: number;
  waypointIndex: number;
  stationId: string;
}

export interface ObliqueImageRecord extends BasicObliqueImageRecord {
  centerWGS84: [number, number, number];
  fallbackHeading: number;
  sector: CardinalDirectionEnum;
  cartesian: Cartesian3;
  derivedExtOri?: DerivedExteriorOrientation;
}

export type NearestObliqueImageRecord = {
  record: ObliqueImageRecord;
  distanceOnGround: number;
  distanceToCamera: number;
  imageCenter: Omit<PointWithSector, "id">;
};

export type ObliqueImageRecordMap = Map<string, ObliqueImageRecord>;

export type AnimationConfig = {
  delay?: number; // in ms, useful for synchronizing independedent animations
  duration?: number; // in ms, also max value for dynamic duration
  easingFunction?: EasingFunction.Callback;
};

export type ObliqueAnimationsConfig = {
  flyToExteriorOrientation?: AnimationConfig;
  outlineFadeOut?: AnimationConfig;
};

export type ObliqueFootprintsStyle = {
  outlineColor?: Color;
  outlineWidth?: number;
  outlineOpacity?: number;
};

export interface ObliqueImagePreviewStyle {
  backdropColor?: string;
  border?: string;
  boxShadow?: string;
}

export interface ObliqueDataProviderConfig {
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
  footprintsStyle?: ObliqueFootprintsStyle;
  imagePreviewStyle?: ObliqueImagePreviewStyle;
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
