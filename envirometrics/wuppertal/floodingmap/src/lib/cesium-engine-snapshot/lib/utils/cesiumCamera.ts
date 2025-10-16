import { Camera, Cartesian2, Math as CesiumMath } from "cesium";

import type { Radians } from "@carma/units/types";

import type { CesiumContextType } from "../CesiumContext";

const clampToToleranceRange = (
  value: number,
  target: number,
  tolerance: number
): number => {
  const min = target - tolerance;
  const max = target + tolerance;
  return Math.min(Math.max(value, min), max);
};

export const getCesiumCameraPixelDimensionForDistance = (
  ctx: CesiumContextType,
  distance: number
): { x: number; y: number; average: number } | null => {
  let pixelDimensions;

  const hasDimensions = ctx.withCamera((camera, viewer) => {
    pixelDimensions = camera.frustum.getPixelDimensions(
      viewer.scene.drawingBufferWidth,
      viewer.scene.drawingBufferHeight,
      distance,
      viewer.resolutionScale,
      new Cartesian2()
    );
  });

  if (!hasDimensions) {
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
  const isInNadirRange =
    Math.abs(camera.pitch + CesiumMath.PI_OVER_TWO) < nadirRange;
  const rollCorrectedHeading = isInNadirRange
    ? (camera.heading + camera.roll) % CesiumMath.TWO_PI
    : camera.heading;
  return rollCorrectedHeading as Radians;
};
