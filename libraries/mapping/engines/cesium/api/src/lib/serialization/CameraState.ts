import type { Altitude, LatLngAlt } from "@carma/geo/types";
import type { Radians } from "@carma/units/types";
import type { Cartesian3, Matrix4 } from "../cesium";
import type { SerializedCesiumFrustum } from "./Frustum";

export type CameraStateRecord = {
  position: Cartesian3;
  direction: Cartesian3;
  up: Cartesian3;
  right?: Cartesian3;
  fov?: number;
  _type?: string;
};

export type CapturedCameraState = CameraStateRecord & {
  heading?: Radians;
  pitch?: Radians;
  roll?: Radians;
  cartographic?: LatLngAlt.rad | null;
  viewMatrix?: Matrix4;
  inverseViewMatrix?: Matrix4;
  frustum?: SerializedCesiumFrustum;
};

export type CameraStateHeadingPitchRoll = {
  longitude: Radians;
  latitude: Radians;
  altitude: Altitude.EllipsoidalWGS84Meters;
  heading: Radians;
  pitch: Radians;
  roll?: Radians;
  fov?: Radians;
};

export type CameraState = CameraStateRecord | CameraStateHeadingPitchRoll;
