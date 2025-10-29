import {
  Camera,
  Cartesian3,
  BoundingSphere,
  HeadingPitchRange,
  Matrix4,
  PerspectiveFrustum,
  Cartesian2,
} from "cesium";

import type {
  Altitude,
  Latitude,
  Longitude,
  LatLngAlt,
} from "@carma/geo/types";
import { radToDeg, PI_OVER_TWO, TWO_PI } from "@carma/units/helpers";
import type { Radians, Degrees } from "@carma/units/types";
import { cartographicToUnitTyped } from "./Cartographic";

export interface CameraPrimitive {
  position: Cartesian3;
  direction: Cartesian3;
  up: Cartesian3;
  right?: Cartesian3;
  fov?: number;
  frustum?: { fov?: number };
}

export interface DirectionUp {
  direction: Cartesian3;
  up: Cartesian3;
  right?: Cartesian3;
}

/**
 * Camera state with position and heading, pitch, roll angles
 */
type CameraStateHeadingPitchRollDegrees = {
  longitude: Degrees;
  latitude: Degrees;
  altitude: Altitude.EllipsoidalWGS84Meters;
  heading: Degrees;
  pitch: Degrees;
  roll?: Degrees;
  fov?: Degrees;
};

type CameraStateHeadingPitchRollRadians = {
  longitude: Radians;
  latitude: Radians;
  altitude: Altitude.EllipsoidalWGS84Meters;
  heading: Radians;
  pitch: Radians;
  roll?: Radians;
  fov?: Radians;
};

export namespace CameraStateHeadingPitchRoll {
  export type deg = CameraStateHeadingPitchRollDegrees;
  export type rad = CameraStateHeadingPitchRollRadians;
}

export { Camera };

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
  const { latitude, longitude, height } = cartographicToUnitTyped(pos);
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
 * Restore camera state from CameraPrimitive (for crash recovery)
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
export const restoreCameraState = (
  camera: Camera,
  state: CameraPrimitive
): void => {
  // Restore position and orientation using setView
  // This handles coordinate frames properly and updates view matrix
  // DirectionUp format: { direction, up, right? }
  if (state.position && state.direction && state.up) {
    const orientation: DirectionUp = {
      direction: state.direction,
      up: state.up,
      ...(state.right && { right: state.right }), // Only include if defined
    };

    camera.setView({
      destination: state.position,
      orientation,
    });
  }

  // Restore FOV separately (not part of setView API)
  if (
    state.frustum?.fov !== undefined &&
    camera.frustum instanceof PerspectiveFrustum
  ) {
    camera.frustum.fov = state.frustum.fov;
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
): CameraPrimitive => {
  const state: CameraPrimitive = {
    position: camera.positionWC.clone(),
    direction: camera.directionWC.clone(),
    up: camera.upWC.clone(),
    right: camera.rightWC.clone(),
    frustum: {},
  };

  if (
    includeFov &&
    camera.frustum instanceof PerspectiveFrustum &&
    camera.frustum.fov !== undefined
  ) {
    state.frustum = state.frustum || {};
    state.frustum.fov = camera.frustum.fov;
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
 * Calculate pixel dimensions for a given distance using the camera frustum
 *
 * No Scene dependency - pure frustum calculation.
 *
 * @param frustum - Perspective frustum
 * @param drawingBufferWidth - Drawing buffer width in pixels
 * @param drawingBufferHeight - Drawing buffer height in pixels
 * @param distance - Distance from camera in meters
 * @param resolutionScale - Resolution scale factor
 * @returns Pixel dimensions {x, y, average} or null if calculation fails
 */
export const getFrustumPixelDimensionsForDistance = (
  frustum: PerspectiveFrustum,
  drawingBufferWidth: number,
  drawingBufferHeight: number,
  distance: number,
  resolutionScale: number
): { x: number; y: number; average: number } | null => {
  let pixelDimensions: Cartesian2 | null = null;

  try {
    pixelDimensions = frustum.getPixelDimensions(
      drawingBufferWidth,
      drawingBufferHeight,
      distance,
      resolutionScale,
      new Cartesian2()
    );
  } catch (error) {
    console.error(
      "Failed to get pixel dimensions for distance",
      distance,
      error
    );
    return null;
  }

  if (!pixelDimensions) {
    return null;
  }

  const { x, y } = pixelDimensions;
  return { x, y, average: (x + y) / 2 };
};

/**
 * Validate camera state in HeadingPitchRoll format
 *
 * Type guard function that validates unknown input as CameraStateHeadingPitchRoll.deg
 * @returns true if valid, false if invalid
 */
export function validateCameraStateHeadingPitchRoll(
  state: unknown,
  fieldName: string = "cameraState"
): state is CameraStateHeadingPitchRoll.deg {
  const errors: string[] = [];

  // Type guard to ensure state is an object
  if (!state || typeof state !== "object") {
    return false;
  }

  // Validate latitude (-90 to 90)
  if (
    !("latitude" in state) ||
    typeof (state as any).latitude !== "number" ||
    isNaN((state as any).latitude)
  ) {
    errors.push(`${fieldName}.latitude must be a number`);
  } else if ((state as any).latitude < -90 || (state as any).latitude > 90) {
    errors.push(`${fieldName}.latitude must be between -90 and 90 degrees`);
  }

  // Validate longitude (-180 to 180)
  if (
    !("longitude" in state) ||
    typeof (state as any).longitude !== "number" ||
    isNaN((state as any).longitude)
  ) {
    errors.push(`${fieldName}.longitude must be a number`);
  } else if (
    (state as any).longitude < -180 ||
    (state as any).longitude > 180
  ) {
    errors.push(`${fieldName}.longitude must be between -180 and 180 degrees`);
  }

  // Validate altitude
  if (
    !("altitude" in state) ||
    typeof (state as any).altitude !== "number" ||
    isNaN((state as any).altitude)
  ) {
    errors.push(`${fieldName}.altitude must be a number`);
  }

  // Validate optional heading
  if ("heading" in state && (state as any).heading !== undefined) {
    if (
      typeof (state as any).heading !== "number" ||
      isNaN((state as any).heading)
    ) {
      errors.push(`${fieldName}.heading must be a number`);
    }
  }

  // Validate optional pitch
  if ("pitch" in state && (state as any).pitch !== undefined) {
    if (
      typeof (state as any).pitch !== "number" ||
      isNaN((state as any).pitch)
    ) {
      errors.push(`${fieldName}.pitch must be a number`);
    } else if ((state as any).pitch < -90 || (state as any).pitch > 90) {
      errors.push(`${fieldName}.pitch must be between -90 and 90 degrees`);
    }
  }

  // Validate optional roll
  if ("roll" in state && (state as any).roll !== undefined) {
    if (typeof (state as any).roll !== "number" || isNaN((state as any).roll)) {
      errors.push(`${fieldName}.roll must be a number`);
    }
  }

  // Validate optional FOV
  if ("fov" in state && (state as any).fov !== undefined) {
    if (typeof (state as any).fov !== "number" || isNaN((state as any).fov)) {
      errors.push(`${fieldName}.fov must be a number`);
    } else if ((state as any).fov <= 0 || (state as any).fov >= 180) {
      errors.push(
        `${fieldName}.fov must be between 0 and 180 degrees (exclusive)`
      );
    }
  }

  if (errors.length > 0) {
    console.error(`[Camera State Validation Failed]\n${errors.join("\n")}`);
    return false;
  }

  return true;
}
