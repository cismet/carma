import type { Altitude, LatLngAlt } from "@carma/geo/types";
import type { Degrees, Radians } from "@carma/units/types";
import type { Cartesian3, Matrix4 } from "../cesium";
import type { SerializedCesiumFrustum } from "./FrustumSerialization";

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
  longitude: Degrees;
  latitude: Degrees;
  altitude: Altitude.EllipsoidalWGS84Meters;
  heading: Degrees;
  pitch: Degrees;
  roll?: Degrees;
  fov?: Degrees;
};

export type CameraState = CameraStateRecord | CameraStateHeadingPitchRoll;
