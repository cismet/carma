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
  CameraPrimitive,
  CameraStateHeadingPitchRoll,
} from "@carma/cesium";
import { degToRad } from "@carma/units/helpers";
import type { Degrees } from "@carma/units/types";

/**
 * Transform HeadingPitchRollPrimitive to CameraPrimitive
 *
 * Converts from local ENU (East-North-Up) coordinate system to ECEF coordinates.
 * Uses proper Cesium Transforms API for accurate coordinate system conversions.
 *
 * Key transformations:
 * - latitude, longitude, altitude → ECEF Cartesian3 position
 * - heading, pitch, roll → ECEF direction, up, right vectors
 */
export const transformHeadingPitchRollToPrimitive = (
  state: CameraStateHeadingPitchRoll.deg | undefined
): CameraPrimitive | undefined => {
  if (!state) {
    return undefined;
  }

  const {
    latitude,
    longitude,
    altitude,
    heading = 0 as Degrees,
    pitch = -90 as Degrees,
    roll = 0 as Degrees,
    fov,
  } = state;

  // 1. Convert position from degrees + altitude to ECEF Cartesian3
  const cartographic = Cartographic.fromDegrees(longitude, latitude, altitude);
  const position = Ellipsoid.WGS84.cartographicToCartesian(cartographic);

  // 2. Convert heading/pitch/roll from degrees to radians
  const headingRad = degToRad(heading);
  const pitchRad = degToRad(pitch);
  const rollRad = degToRad(roll);

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
    primitive.frustum = primitive.frustum || {};
    primitive.frustum.fov = degToRad(fov);
  }

  return primitive;
};
