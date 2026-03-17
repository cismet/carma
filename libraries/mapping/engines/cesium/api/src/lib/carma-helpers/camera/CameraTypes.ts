import type { CameraType, CameraView } from "@carma-commons/camera/model";
import type { Altitude, LatLngAlt } from "@carma/geo/types";
import type { DirectionUpFrame } from "@carma/math";
import type { Degrees, Radians } from "@carma/units/types";
import type { Cartesian3, Matrix4 } from "../../cesium";

export type CameraStateRecord = {
  position: Cartesian3;
  direction: Cartesian3;
  up: Cartesian3;
  right?: Cartesian3;
  fov?: number;
  _type?: string; // Type discriminator for debugging
};

export type CapturedCameraState = CameraStateRecord & {
  heading?: Radians;
  pitch?: Radians;
  roll?: Radians;
  cartographic?: LatLngAlt.rad | null;
  matrixWorld?: Matrix4;
  matrixWorldInverse?: Matrix4;
  viewMatrix?: Matrix4;
  inverseViewMatrix?: Matrix4;
  projectionMatrix?: Matrix4;
  projectionMatrixInverse?: Matrix4;
  type?: CameraType;
  aspect?: number;
  near?: number;
  far?: number;
  zoom?: number;
  focus?: number;
  filmGauge?: number;
  filmOffset?: number;
  view?: CameraView;
};

export type CaptureCurrentCameraStateOptions = {
  includeFov?: boolean;
  includeOrientation?: boolean;
  includeCartographic?: boolean;
  includeMatrices?: boolean;
};

export type DirectionUp = DirectionUpFrame<Cartesian3>;

/**
 * Camera state with position and heading, pitch, roll angles.
 * Serializable format for url params etc.
 */
export type CameraStateHeadingPitchRoll = {
  longitude: Degrees;
  latitude: Degrees;
  altitude: Altitude.EllipsoidalWGS84Meters;
  heading: Degrees;
  pitch: Degrees;
  roll?: Degrees;
  fov?: Degrees;
};

export type CameraState = CameraStateRecord | CameraStateHeadingPitchRoll;
