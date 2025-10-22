import { Camera, Cartesian2, Cartesian3, type Scene } from "@carma/cesium";

import type { Radians } from "@carma/units/types";
import { PI_OVER_TWO, TWO_PI } from "@carma/units/helpers";

// Camera direction when pointing straight down (nadir)
const TOP_DOWN_DIRECTION = new Cartesian3(0, 0, -1);

export const getCesiumFrustumPixelDimensionsForDistance = (
  scene: Scene,
  resolutionScale: number,
  distance: number
): { x: number; y: number; average: number } | null => {
  const { camera } = scene;
  const { frustum } = camera;
  let pixelDimensions: Cartesian2 | null = null;

  try {
    pixelDimensions = frustum.getPixelDimensions(
      scene.drawingBufferWidth,
      scene.drawingBufferHeight,
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

  if (
    x === 0 ||
    y === 0 ||
    Number.isNaN(x) ||
    Number.isNaN(y) ||
    x === Infinity ||
    y === Infinity ||
    x === -Infinity ||
    y === -Infinity
  ) {
    console.warn("Cesium camera pixel dimensions are not useable");
    return null;
  }

  return {
    x,
    y,
    average: (x + y) / 2,
  };
};

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
