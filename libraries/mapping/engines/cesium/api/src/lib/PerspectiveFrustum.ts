import { PerspectiveFrustum, Cartesian2 } from "cesium";

export { PerspectiveFrustum };

export const isPerspectiveFrustum = (
  frustum: unknown
): frustum is PerspectiveFrustum => {
  return frustum instanceof PerspectiveFrustum;
};

/**
 * Calculate pixel dimensions for a given distance using the camera frustum
 *
 * No Scene dependency - pure frustum calculation.
 *
 * @param distance - Distance from camera in meters
 * @param frustum - Perspective frustum
 * @param drawingBufferWidth - Drawing buffer width in pixels
 * @param drawingBufferHeight - Drawing buffer height in pixels
 * @param resolutionScale - Resolution scale factor
 * @returns Pixel dimensions {x, y, average} or null if calculation fails
 */
export const getFrustumPixelDimensionsForDistance = (
  distance: number,
  frustum: PerspectiveFrustum,
  drawingBufferWidth: number,
  drawingBufferHeight: number,
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
