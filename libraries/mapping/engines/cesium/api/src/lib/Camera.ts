import {
  Camera,
  Cartesian3,
  BoundingSphere,
  HeadingPitchRange,
  Matrix4,
  PerspectiveFrustum,
  type HeadingPitchRollValues,
} from "cesium";

import type {
  Altitude,
  Latitude,
  Longitude,
  LatLngAlt,
} from "@carma/geo/types";
import {
  radToDeg,
  degToRad,
  PI_OVER_TWO,
  TWO_PI,
  ZERO_PI,
  MINUS_PI_OVER_TWO,
} from "@carma/units/helpers";
import type { Radians, Degrees } from "@carma/units/types";
import { shortestAngleDelta } from "@carma/math";
import { cartographicToJson } from "./Cartographic";
import type {
  HeadingPitchJson,
  HeadingPitchRollJson,
} from "./HeadingPitchRoll";

export { Camera };

export type CameraStateRecord = {
  position: Cartesian3;
  direction: Cartesian3;
  up: Cartesian3;
  right?: Cartesian3;
  fov?: number;
  _type?: string; // Type discriminator for debugging
};

export const isCameraStateRecord = (
  camera: unknown
): camera is CameraStateRecord => {
  const candidate = camera as CameraStateRecord;
  return (
    candidate &&
    typeof candidate === "object" &&
    candidate.position !== undefined &&
    candidate.direction !== undefined &&
    candidate.up !== undefined
  );
};

export type DirectionUp = {
  direction: Cartesian3;
  up: Cartesian3;
  right?: Cartesian3;
};

/**
 * Camera state with position and heading, pitch, roll angles
 * Serializable format for url params etc
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

export const isCameraStateHeadingPitchRoll = (
  camera: unknown
): camera is CameraStateHeadingPitchRoll => {
  const candidate = camera as CameraStateHeadingPitchRoll;
  return (
    candidate &&
    typeof candidate === "object" &&
    candidate.longitude !== undefined &&
    candidate.latitude !== undefined &&
    candidate.altitude !== undefined &&
    candidate.heading !== undefined &&
    candidate.pitch !== undefined
  );
};

export type CameraState = CameraStateRecord | CameraStateHeadingPitchRoll;

// Camera direction when pointing straight down (nadir)
const TOP_DOWN_DIRECTION = new Cartesian3(0, 0, -1);

// Reusable scratch objects for flyToTarget
const scratchBoundingSphere = new BoundingSphere();
const scratchHeadingPitchRange = new HeadingPitchRange();

/**
 * Calculates the angular deviation between the camera's current direction and top-down (nadir) direction.
 * Used for determining transition animation duration based on how far the camera needs to rotate.
 *
 * @param camera - The camera to measure deviation from
 * @returns The angle in radians between current camera direction and straight down
 */
export const getTopDownCameraDeviationAngle = (camera: Camera): Radians => {
  const currentDirection = camera.direction;
  const angle = Cartesian3.angleBetween(currentDirection, TOP_DOWN_DIRECTION);
  return Math.abs(angle) as Radians;
};

/**
 * Calculates angular differences between camera's current HPR and target HPR.
 * Uses shortest angular distance for heading to handle wraparound correctly.
 * Fills missing values: heading defaults to 0, pitch to -π/2 (top-down), roll to 0.
 *
 * @param camera - The camera to compare
 * @param target - Target HPR (partial allowed, missing values use defaults)
 * @returns Object with absolute angular differences for heading, pitch, roll
 */
export const getHeadingPitchRollDiff = (
  camera: Camera,
  target: Partial<HeadingPitchRollJson> = {}
): { heading: Radians; pitch: Radians; roll: Radians } => {
  const targetHeading = (target.heading ?? ZERO_PI) as Radians;
  const targetPitch = (target.pitch ?? MINUS_PI_OVER_TWO) as Radians;
  const targetRoll = (target.roll ?? ZERO_PI) as Radians;

  const headingDiff = Math.abs(
    shortestAngleDelta(camera.heading as Radians, targetHeading)
  ) as Radians;
  const pitchDiff = Math.abs(
    shortestAngleDelta(camera.pitch as Radians, targetPitch)
  ) as Radians;
  const rollDiff = Math.abs(
    shortestAngleDelta(camera.roll as Radians, targetRoll)
  ) as Radians;

  return {
    heading: headingDiff,
    pitch: pitchDiff,
    roll: rollDiff,
  };
};

/**
 * Corrects the camera's heading to account for roll when the camera's pitch is near the nadir.
 * This adjustment prevents the heading from flipping by 180 degrees when tilting above the nadir range.
 *
 * @param camera - The camera from which to retrieve the heading and roll.
 * @param nadirRange - The angular range (in radians) from the nadir within which the camera is considered to be at nadir. Default is 0.2 radians.
 * @returns The heading adjusted for roll when near the nadir, otherwise the original heading.
 */
export const applyRollToHeadingForCameraNearNadir = (
  camera: Camera,
  nadirRange = 0.2 as Radians
): Radians => {
  const isInNadirRange = Math.abs(camera.pitch + PI_OVER_TWO) < nadirRange;
  const rollCorrectedHeading = isInNadirRange
    ? (camera.heading + camera.roll) % TWO_PI
    : camera.heading;
  return rollCorrectedHeading as Radians;
};

/**
 * Convert camera heading and pitch to JSON format
 * @param camera - The Cesium camera
 * @returns HeadingPitchJson with heading and pitch in radians
 */
export const cameraToHeadingPitchJson = (camera: Camera): HeadingPitchJson => ({
  heading: camera.heading as Radians,
  pitch: camera.pitch as Radians,
});

/**
 * Fly camera to target position with HeadingPitchRange orientation.
 * Wrapper around flyToBoundingSphere that creates the sphere on the fly.
 *
 * @param camera - The Cesium camera
 * @param target - Point to look at (world coordinates)
 * @param hpr - Camera orientation relative to target (heading, pitch, range)
 * @param duration - Optional flight duration in seconds
 */
export const flyToTarget = (
  camera: Camera,
  target: Cartesian3,
  hpr: { heading: number; pitch: number; range: number },
  duration?: number
): void => {
  scratchBoundingSphere.center = target;
  scratchBoundingSphere.radius = 0;

  scratchHeadingPitchRange.heading = hpr.heading;
  scratchHeadingPitchRange.pitch = hpr.pitch;
  scratchHeadingPitchRange.range = hpr.range;

  const options: {
    offset: HeadingPitchRange;
    duration?: number;
  } = {
    offset: scratchHeadingPitchRange,
  };
  if (duration !== undefined) {
    options.duration = duration;
  }
  camera.flyToBoundingSphere(scratchBoundingSphere, options);
};

export const isValidCamera = (camera: unknown): camera is Camera =>
  camera instanceof Camera;

/**
 * Validates a Camera and executes a callback if valid
 */
export const tryWithValidCamera = (
  camera: unknown,
  cb: (camera: Camera) => void,
  label: string = "camera"
) => {
  if (!isValidCamera(camera)) {
    console.error(`tryWithValidCamera had invalid Camera ${label}`);
    return;
  }
  try {
    cb(camera);
  } catch (e) {
    console.error(`tryWithValidCamera failed on ${label}`, e);
  }
};

export const cameraPositionCartographicRadians = (
  camera: Camera
): LatLngAlt.rad => {
  const pos = camera.positionCartographic.clone();
  const { latitude, longitude, height } = cartographicToJson(pos);
  return {
    latitude,
    longitude,
    altitude: height,
  };
};

export const cameraPositionCartographicDegrees = (
  camera: Camera
): LatLngAlt.deg => {
  const { latitude, longitude, height } = camera.positionCartographic.clone();
  return {
    latitude: radToDeg(latitude as Radians) as Latitude.deg,
    longitude: radToDeg(longitude as Radians) as Longitude.deg,
    altitude: height as Altitude.EllipsoidalWGS84Meters,
  };
};

/**
 * Restore camera state from CameraState (for crash recovery)
 *
 * Restores camera position, orientation vectors, and FOV.
 * This is the fastest way to restore camera state - uses setView for proper
 * coordinate frame handling, then restores FOV separately.
 *
 * Note: setView updates the camera's view matrix internally, which is what you want
 * for proper rendering. The view matrix is derived from position/direction/up/right.
 *
 * @param camera - The Cesium camera to restore
 * @param state - The saved camera state
 */
export const setViewFromCameraState = (
  camera: Camera,
  state: CameraState
): void => {
  if (isCameraStateRecord(state)) {
    // Restore position and orientation using setView
    // This handles coordinate frames properly and updates view matrix
    // DirectionUp format: { direction, up, right? }
    const { position, direction, up, right } = state;
    const destination = position;
    const orientation: DirectionUp = {
      direction,
      up,
    };
    if (right) {
      orientation.right = right;
    }
    camera.setView({ destination, orientation });
  } else if (isCameraStateHeadingPitchRoll(state)) {
    const destination = Cartesian3.fromDegrees(
      state.longitude,
      state.latitude,
      state.altitude
    );
    const orientation: HeadingPitchRollValues = {
      heading: degToRad(state.heading),
      pitch: degToRad(state.pitch),
      roll: ZERO_PI,
    };

    if (state.roll !== undefined) {
      orientation.roll = degToRad(state.roll);
    }
    camera.setView({ destination, orientation });
  } else {
    console.error("Invalid camera state format for recovery");
    return;
  }

  // Restore FOV separately (not part of setView API)
  if (state.fov !== undefined && camera.frustum instanceof PerspectiveFrustum) {
    camera.frustum.fov = state.fov;
  }
};

/**
 * Capture the current camera state in world coordinates (latest render state).
 *
 * This is a low-overhead operation that:
 * - Uses the WC (World Coordinate) properties which call updateMembers() internally
 * - Captures position, direction, up, right vectors from the last render
 * - Optionally includes FOV from the frustum
 *
 * Used for:
 * - Crash recovery (storing camera state)
 * - Orbit mode release (preserving current position)
 * - Camera state tracking
 *
 * @param camera - The Cesium camera
 * @param includeFov - Whether to capture FOV (default: true)
 * @returns Camera state in world coordinates with optional FOV
 */
export const captureCurrentCameraState = (
  camera: Camera,
  includeFov: boolean = true
): CameraStateRecord => {
  const state: CameraStateRecord = {
    // need to use world coordinates to capture the latest render state,
    // only state that acts as a getter
    position: camera.positionWC.clone(),
    direction: camera.directionWC.clone(),
    up: camera.upWC.clone(),
    right: camera.rightWC.clone(),
  };

  if (
    includeFov &&
    camera.frustum instanceof PerspectiveFrustum &&
    camera.frustum.fov !== undefined
  ) {
    state.fov = camera.frustum.fov;
  }

  return state;
};

/**
 * Release camera from orbit/lookAt mode while preserving current position.
 *
 * This solves the common problem where calling `camera.lookAtTransform(Matrix4.IDENTITY)`
 * causes the camera to snap to an old cached position. Instead, this function:
 * 1. Captures the current camera state in WORLD COORDINATES (latest render state)
 * 2. Releases the lookAt transform
 * 3. Restores the exact current position to prevent unwanted snapping
 *
 * Use this when ending drag operations or orbit controls to ensure smooth transitions.
 *
 * @param camera - The Cesium camera to release from orbit mode
 */
export const releaseCameraFromOrbitMode = (camera: Camera): void => {
  // Capture current camera state in world coordinates (latest render state)
  const state = captureCurrentCameraState(camera, false);

  // Release the lookAt transform (exits orbit mode)
  camera.lookAtTransform(Matrix4.IDENTITY);

  // Restore the camera state to prevent snapping to old position
  if (state.position) camera.position = state.position;
  if (state.direction) camera.direction = state.direction;
  if (state.up) camera.up = state.up;
  if (state.right) camera.right = state.right;
};

/**
 * Validate camera state in HeadingPitchRoll format
 *
 * Type guard function that validates unknown input as CameraStateHeadingPitchRoll
 * like from url values
 * @returns true if valid, false if invalid
 */
export function validateCameraStateHeadingPitchRoll(
  state: unknown
): [boolean, CameraStateHeadingPitchRoll | null] {
  if (!state || typeof state !== "object") {
    return [false, null];
  }

  const obj = state as CameraStateHeadingPitchRoll;

  const latitude = obj.latitude;
  const longitude = obj.longitude;
  const altitude = obj.altitude;

  const hasPosition =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Number.isFinite(altitude);

  if (!hasPosition) {
    console.debug("Invalid camera state: missing or invalid position");
    return [false, null];
  }

  const result: CameraStateHeadingPitchRoll = {
    latitude: latitude as Degrees,
    longitude: longitude as Degrees,
    altitude: altitude as Altitude.EllipsoidalWGS84Meters,
    heading: radToDeg(ZERO_PI),
    pitch: radToDeg(MINUS_PI_OVER_TWO),
    roll: radToDeg(ZERO_PI),
  };

  const hasOrientation =
    Number.isFinite(obj.heading) &&
    Number.isFinite(obj.pitch) &&
    obj.roll !== undefined &&
    Number.isFinite(obj.roll);

  if (!hasOrientation) {
    console.warn("Invalid camera state: missing or invalid orientation");
    return [false, result];
  }

  result.heading = obj.heading;
  result.pitch = obj.pitch;
  if (obj.roll !== undefined) {
    result.roll = obj.roll;
  }

  if (obj.fov !== undefined && Number.isFinite(obj.fov)) {
    result.fov = obj.fov;
  }

  return [true, result];
}
