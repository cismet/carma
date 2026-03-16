import type { LatLngAlt } from "@carma/geo/types";
import type { Mat4, Quat, Vec2, Vec3 } from "@carma/math";
import type {
  CssPixels,
  DevicePixels,
  Meters,
  Radians,
} from "@carma/units/types";

// Mirrors the camera data that engines like Three.js carry internally:
// matrixWorld/matrixWorldInverse/projectionMatrix plus optional object-centric
// convenience fields for heading/pitch/range anchored views.
export type CameraType = "PerspectiveCamera" | "OrthographicCamera";

export type CameraBasis = {
  direction: Vec3;
  up: Vec3;
  right?: Vec3;
};

export type ObjectCentricCameraAnchor = LatLngAlt.rad & {
  altitude: NonNullable<LatLngAlt.rad["altitude"]>;
};

export type CameraImage = {
  width: CssPixels;
  height: CssPixels;
  deviceWidth?: DevicePixels;
  deviceHeight?: DevicePixels;
};

export type CameraView = {
  enabled?: boolean;
  fullWidth: CssPixels;
  fullHeight: CssPixels;
  offsetX: CssPixels;
  offsetY: CssPixels;
  width: CssPixels;
  height: CssPixels;
};

export type CameraIntrinsics = {
  type?: CameraType;
  projectionMatrix?: Mat4;
  projectionMatrixInverse?: Mat4;
  fov?: Radians;
  fovHorizontal?: Radians;
  aspect?: number;
  zoom?: number;
  near?: Meters;
  far?: Meters;
  focus?: number;
  filmGauge?: number;
  filmOffset?: number;
  focalLength?: number;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  principalPoint?: Vec2;
  sensorSize?: Vec2;
  image?: CameraImage;
  view?: CameraView;
};

export type CameraPose = {
  matrixWorld?: Mat4;
  matrixWorldInverse?: Mat4;
  basisMatrix?: Mat4;
  position?: Vec3;
  direction?: Vec3;
  up?: Vec3;
  right?: Vec3;
  quaternion?: Quat;
  basis?: CameraBasis;
};

export type ObjectCentricCameraPose = CameraPose & {
  anchor: ObjectCentricCameraAnchor;
  heading: Radians;
  pitch: Radians;
  range: Meters;
  roll?: Radians;
};

export type CameraModel<
  TPose extends CameraPose = ObjectCentricCameraPose,
> = {
  pose: TPose;
  intrinsics?: CameraIntrinsics;
};

export type ObjectCentricCameraModel = CameraModel<ObjectCentricCameraPose>;
