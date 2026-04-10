import type { Altitude, LatLngAlt } from "@carma-geo/data-structures";
import type { Radians } from "@carma-units";

import type { Cartesian3, Matrix4 } from "@carma-cesium";
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

// Compatibility-only legacy format.
// Preferred CARMA camera state is direction/up/right plus position.
// Remove this type once transition, switcher, and story paths stop carrying
// heading/pitch/roll-based Cesium camera state.
export type CameraStateHeadingPitchRoll = {
  longitude: Radians;
  latitude: Radians;
  altitude: Altitude.EllipsoidalWGS84Meters;
  heading: Radians;
  pitch: Radians;
  roll?: Radians;
  fov?: Radians;
};

export type SerializedCameraStateHeadingPitchRoll = CameraStateHeadingPitchRoll;

export type CameraState = CameraStateRecord | CameraStateHeadingPitchRoll;
