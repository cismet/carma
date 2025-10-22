import type { Camera, PerspectiveFrustum, Cartesian3 } from "cesium";
import type { Radians } from "@carma/units/types";
import type {
  Longitude,
  Latitude,
  Altitude,
  Degrees,
  Meters,
} from "@carma/geo/types";

/**
 * DirectionUp orientation format for Camera.setView()
 * Based on official Cesium API: https://cesium.com/learn/ion-sdk/ref-doc/global.html#DirectionUp
 *
 * Specifies camera orientation using direction and up vectors.
 * The right vector is optional and will be computed if not provided.
 */
export interface DirectionUp {
  /** The direction vector (normalized) */
  direction: Cartesian3;
  /** The up vector (normalized) */
  up: Cartesian3;
  /** The right vector (optional, computed from direction × up if not provided) */
  right?: Cartesian3 | undefined;
}

/**
 * Complete camera state for crash recovery
 * Stores position, orientation vectors (in ECEF), and frustum state
 *
 * **Restore pattern (handles coordinate frames properly):**
 * ```typescript
 * camera.setView({
 *   destination: state.position,
 *   orientation: {
 *     direction: state.direction,
 *     right: state.right,
 *     up: state.up
 *   }
 * });
 * // Restore FOV separately
 * if (camera.frustum instanceof PerspectiveFrustum && state.frustum.fov) {
 *   camera.frustum.fov = state.frustum.fov;
 * }
 * ```
 *
 * Note: Stores all 4 vectors (position, direction, up, right) for complete, unambiguous camera state.
 * Values are in ECEF (not necessarily human-readable), but setView handles this correctly.
 */
export type CameraPrimitive = Partial<
  Pick<Camera, "position" | "direction" | "up" | "right">
> & {
  // only perspective frustum is supported
  frustum: {
    fov?: Pick<PerspectiveFrustum, "fov">["fov"];
  };
};

// heading pitch roll defaults to top down north.
// 0 heading is north, (-90 ; -PI/2) pitch is looking down. Roll is 0.

export type CameraPoseDegrees = {
  longitude: Longitude.deg;
  latitude: Latitude.deg;
  height: Altitude.EllipsoidalWGS84Meters;
  heading?: Degrees;
  pitch?: Degrees;
  roll?: Degrees;
};

export type CameraPoseRadians = {
  longitude: Radians;
  latitude: Radians;
  height: Meters;
  heading?: Radians;
  pitch?: Radians;
  roll?: Radians;
};

export type CameraPoseNumeric = {
  longitude: number;
  latitude: number;
  height: number;
  heading?: number;
  pitch?: number;
  roll?: number;
};

export namespace CameraPoseHeadingPitchRoll {
  export type Deg = CameraPoseDegrees;
  export type Rad = CameraPoseRadians;
  export type Num = CameraPoseNumeric;
}

// for portal app state (external - uses Degrees)
export type CameraStateHeadingPitchRoll = {
  longitude: Longitude.deg;
  latitude: Latitude.deg;
  altitude: Altitude.EllipsoidalWGS84Meters;
  heading?: Degrees;
  pitch?: Degrees;
  roll?: Degrees;
  fov?: Degrees;
};
