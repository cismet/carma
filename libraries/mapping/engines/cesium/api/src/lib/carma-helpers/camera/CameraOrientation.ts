import { Cartesian3, type Camera } from "../../cesium";
import {
  PI_OVER_TWO,
  TWO_PI,
  ZERO_PI,
  MINUS_PI_OVER_TWO,
} from "@carma/units/helpers";
import type { Radians } from "@carma/units/types";
import { shortestAngleDelta } from "@carma/math";
import type {
  HeadingPitchJson,
  HeadingPitchRollJson,
} from "../../serialization/base";

// Camera direction when pointing straight down (nadir).
const TOP_DOWN_DIRECTION = new Cartesian3(0, 0, -1);

/**
 * Calculates the angular deviation between the camera's current direction and top-down (nadir) direction.
 */
export const getTopDownCameraDeviationAngle = (camera: Camera): Radians => {
  const currentDirection = camera.direction;
  const angle = Cartesian3.angleBetween(currentDirection, TOP_DOWN_DIRECTION);
  return Math.abs(angle) as Radians;
};

/**
 * Calculates angular differences between camera's current HPR and target HPR.
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
 * Corrects heading to account for roll while pitch is near nadir.
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
 * Convert camera heading and pitch to JSON format.
 */
export const cameraToHeadingPitchJson = (camera: Camera): HeadingPitchJson => ({
  heading: camera.heading as Radians,
  pitch: camera.pitch as Radians,
});
