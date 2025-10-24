import { PerspectiveFrustum, Cartesian2 } from "cesium";
import type { Degrees, Radians } from "@carma/units/types";
import { degToRad, clamp } from "@carma/units/helpers";

export { PerspectiveFrustum };

export const isPerspectiveFrustum = (
  frustum: unknown
): frustum is PerspectiveFrustum => {
  return frustum instanceof PerspectiveFrustum;
};

// FOV bounds (elemental constants)
export const DEFAULT_MIN_FOV = degToRad(1 as Degrees);
export const DEFAULT_MAX_FOV = degToRad(179 as Degrees);

/**
 * Validates if a value is a valid FOV (field of view) in radians.
 * Valid FOV must be between 1° and 179°.
 */
export const isValidFov = (fov: unknown): fov is Radians => {
  return (
    typeof fov === "number" && fov >= DEFAULT_MIN_FOV && fov <= DEFAULT_MAX_FOV
  );
};

/**
 * Clamps FOV to valid range [1°, 179°]
 */
export const clampToValidFov = (fov: Radians): Radians => {
  return clamp(fov, DEFAULT_MIN_FOV, DEFAULT_MAX_FOV) as Radians;
};

/**
 * Get pixel dimensions of a perspective frustum at a given distance.
 *
 * Primitive utility for calculating how many meters each pixel represents
 * at a specific distance. Used for zoom/range conversions.
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
    console.warn("Frustum pixel dimensions are not useable");
    return null;
  }

  return {
    x,
    y,
    average: (x + y) / 2,
  };
};
