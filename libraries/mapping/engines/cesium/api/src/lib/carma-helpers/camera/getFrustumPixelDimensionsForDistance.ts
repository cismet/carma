import { Cartesian2, PerspectiveFrustum } from "../../cesium";

export type FrustumPixelDimensions = {
  x: number;
  y: number;
  average: number;
};

export const getFrustumPixelDimensionsForDistance = (
  distance: number,
  frustum: PerspectiveFrustum,
  drawingBufferWidth: number,
  drawingBufferHeight: number,
  resolutionScale: number
): FrustumPixelDimensions | null => {
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
