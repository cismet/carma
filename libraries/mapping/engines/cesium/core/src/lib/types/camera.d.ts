import { Altitude, Latitude, Longitude } from "@carma/geo/types";
import { Degrees, Radians } from "@carma/units/types";

/**
 * Cesium Camera Orientation System: East-North-Up (ENU)
 *
 * @see https://cesium.com/learn/cesiumjs/ref-doc/Camera.html
 * @see https://community.cesium.com/t/heading-pitch-roll/1873
 *
 * "The heading, pitch and roll angles are all computed in the
 * local east-north-up frame at the position." - Cesium docs
 *
 * In the local ENU tangent plane at any geographic position:
 * - **Heading**: Rotation from local north, positive = eastward (clockwise when looking down)
 * - **Pitch**: Rotation from east-north plane, positive = up, negative = down
 * - **Roll**: Rotation about local east axis (applied first)
 *
 * This is NOT a body frame - it's a local geographic reference frame
 * that rotates with the Earth's surface at each position.
 *
 * for generic orienations see @carma/types/math/orientation.d.ts
 */
export type HeadingPitchRoll<T = Radians> = {
  heading: T extends Degrees ? Degrees : Radians;
  pitch: T extends Degrees ? Degrees : Radians;
  roll: T extends Degrees ? Degrees : Radians;
};

export namespace HeadingPitchRoll {
  export type deg = HeadingPitchRoll<Degrees>;
  export type rad = HeadingPitchRoll<Radians>;
}

export type CameraPositionAndOrientation = {
  position: Cartesian3;
  up: Cartesian3;
  direction: Cartesian3;
};

/**
 * Camera view configuration using target + HeadingPitchRange
 * Target-centric: looking AT a point from heading/pitch/range
 * @see Camera.flyTo() with HeadingPitchRange
 */
export type CameraViewOptions = {
  target: Cartesian3;
  orientation: {
    heading: number;
    pitch: number;
    range: number;
  };
};

/**
 * Camera lookAt configuration (DEPRECATED - use CameraViewOptions instead)
 * @see Camera.lookAt()
 */
export type CameraLookAtOptions = {
  target: Cartesian3;
  offset: Cartesian3;
};

export type CameraPosePlain = {
  longitude: number;
  latitude: number;
  height: number;
  heading: number;
  pitch: number;
};

export type CameraPoseDegrees = {
  longitude: Longitude.deg;
  latitude: Latitude.deg;
  height: Altitude.EllipsoidalWGS84Meters;
  heading: Degrees;
  pitch: Degrees;
};

export type CameraPoseRadians = {
  longitude: Radians;
  latitude: Radians;
  height: Meters;
  heading: Radians;
  pitch: Radians;
};

// for hash handler (internal - uses Radians via Cartographic)
export type CameraState = {
  position: Cartographic;
  heading?: Radians;
  pitch?: Radians;
  fov?: Radians;
};

// for portal app state (external - uses Degrees)
export type CameraStateDegrees = {
  longitude: Longitude.deg;
  latitude: Latitude.deg;
  height: Altitude.EllipsoidalWGS84Meters;
  heading?: Degrees;
  pitch?: Degrees;
  fov?: Degrees;
};

export namespace CameraPose {
  export type Plain = CameraPosePlain;
  export type Deg = CameraPoseDegrees;
  export type Rad = CameraPoseRadians;
}
