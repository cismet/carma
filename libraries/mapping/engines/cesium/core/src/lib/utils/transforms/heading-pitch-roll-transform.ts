/**
 * Camera coordinate transformations
 * Transforms CameraStateHeadingPitchRoll to CameraStatePrimitive using proper Cesium transforms
 *
 * Uses local ENU (East-North-Up) coordinate system as specified:
 * - Heading: rotation around Z-axis (up), 0 = pointing north
 * - Pitch: rotation around local east axis, -90 = looking straight down
 * - Roll: rotation around local direction axis
 */

import {
  Cartesian3,
  Transforms,
  Ellipsoid,
  Cartographic,
  HeadingPitchRoll,
} from "cesium";

import type {
  CameraStateHeadingPitchRoll,
  CameraPrimitive,
} from "@carma/cesium";
import { degToRad } from "@carma/units/helpers";
import type { Degrees } from "@carma/units/types";

/**
 * Transform CameraStateHeadingPitchRoll to CameraStatePrimitive
 *
 * Converts from local ENU (East-North-Up) coordinate system to ECEF coordinates.
 * Uses proper Cesium Transforms API for accurate coordinate system conversions.
 *
 * Key transformations:
 * 1. Position: degrees + altitude → ECEF Cartesian3
 * 2. Orientation: heading/pitch/roll (degrees, local ENU) → direction/up/right vectors (ECEF)
 * 3. FOV: degrees → radians (if provided)
 *
 * @param hprState - Camera state with heading/pitch/roll in degrees and position in degrees/altitude
 * @returns Camera state in ECEF coordinates with orientation vectors
 */
export function transformHeadingPitchRollToPrimitive(
  hprState: CameraStateHeadingPitchRoll
): CameraPrimitive {
  const {
    longitude,
    latitude,
    altitude,
    heading = 0,
    pitch = -90,
    roll = 0,
    fov,
  } = hprState;

  // 1. Convert position from degrees + altitude to ECEF Cartesian3
  const cartographic = Cartographic.fromDegrees(
    longitude as number,
    latitude as number,
    altitude as number
  );
  const position = Ellipsoid.WGS84.cartographicToCartesian(cartographic);

  // 2. Convert heading/pitch/roll from degrees to radians
  const headingRad = degToRad(heading as Degrees);
  const pitchRad = degToRad(pitch as Degrees);
  const rollRad = degToRad(roll as Degrees);

  // 3. Create HeadingPitchRoll object and use Cesium's built-in transformation
  const hpr = new HeadingPitchRoll(headingRad, pitchRad, rollRad);

  // This creates a transformation matrix that handles ENU to ECEF conversion
  // with the heading/pitch/roll orientation properly applied
  const transform = Transforms.headingPitchRollToFixedFrame(position, hpr);

  // 4. Extract orientation vectors from the transformation matrix
  // The transform matrix columns represent the local axes in ECEF coordinates:
  // - Column 0: Right/East direction
  // - Column 1: Up direction
  // - Column 2: Forward/North direction
  const right = Cartesian3.fromElements(
    transform[0],
    transform[4],
    transform[8]
  );
  const up = Cartesian3.fromElements(transform[1], transform[5], transform[9]);
  const direction = Cartesian3.fromElements(
    transform[2],
    transform[6],
    transform[10]
  );

  // 5. Normalize vectors to ensure they are unit vectors
  Cartesian3.normalize(direction, direction);
  Cartesian3.normalize(up, up);
  Cartesian3.normalize(right, right);

  // 6. Create the CameraPrimitive
  const primitive: CameraPrimitive = {
    position,
    direction,
    up,
    right,
    frustum: {},
  };

  // 7. Add FOV if provided (convert from degrees to radians)
  if (fov !== undefined) {
    primitive.frustum.fov = degToRad(fov as unknown as Degrees);
  }

  return primitive;
}

/**
 * Validate camera state in HeadingPitchRoll format
 * @returns true if valid, false if invalid
 */
export function validateCameraStateHeadingPitchRoll(
  state: CameraStateHeadingPitchRoll,
  fieldName: string = "cameraState"
): boolean {
  const errors: string[] = [];

  // Validate latitude (-90 to 90)
  if (typeof state.latitude !== "number" || isNaN(state.latitude)) {
    errors.push(`${fieldName}.latitude must be a number`);
  } else if (state.latitude < -90 || state.latitude > 90) {
    errors.push(`${fieldName}.latitude must be between -90 and 90 degrees`);
  }

  // Validate longitude (-180 to 180)
  if (typeof state.longitude !== "number" || isNaN(state.longitude)) {
    errors.push(`${fieldName}.longitude must be a number`);
  } else if (state.longitude < -180 || state.longitude > 180) {
    errors.push(`${fieldName}.longitude must be between -180 and 180 degrees`);
  }

  // Validate altitude
  if (typeof state.altitude !== "number" || isNaN(state.altitude)) {
    errors.push(`${fieldName}.altitude must be a number`);
  }

  // Validate optional heading
  if (state.heading !== undefined) {
    if (typeof state.heading !== "number" || isNaN(state.heading)) {
      errors.push(`${fieldName}.heading must be a number`);
    }
  }

  // Validate optional pitch
  if (state.pitch !== undefined) {
    if (typeof state.pitch !== "number" || isNaN(state.pitch)) {
      errors.push(`${fieldName}.pitch must be a number`);
    } else if (state.pitch < -90 || state.pitch > 90) {
      errors.push(`${fieldName}.pitch must be between -90 and 90 degrees`);
    }
  }

  // Validate optional roll
  if (state.roll !== undefined) {
    if (typeof state.roll !== "number" || isNaN(state.roll)) {
      errors.push(`${fieldName}.roll must be a number`);
    }
  }

  // Validate optional FOV
  if (state.fov !== undefined) {
    if (typeof state.fov !== "number" || isNaN(state.fov)) {
      errors.push(`${fieldName}.fov must be a number`);
    } else if (state.fov <= 0 || state.fov >= 180) {
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
