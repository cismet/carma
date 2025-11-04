import { type Scene, Cartesian2, isValidCamera } from "@carma/cesium";

export const getPixelDimensionsForDistance = (
  scene: Scene,
  resolutionScale: number,
  distance: number
): { x: number; y: number; average: number } | null => {
  const { camera } = scene;

  if (!isValidCamera(camera)) {
    console.warn("Cesium camera is not valid");
    return null;
  }

  const { drawingBufferHeight, drawingBufferWidth } = scene;

  const hasDimensions =
    Number.isFinite(drawingBufferHeight) && Number.isFinite(drawingBufferWidth);
  drawingBufferHeight > 0 && drawingBufferWidth > 0;

  if (!hasDimensions) {
    console.warn("Cesium scene does not have valid drawing buffer dimensions");
    return null;
  }

  const pixelDimensions = camera.frustum.getPixelDimensions(
    drawingBufferWidth,
    drawingBufferHeight,
    distance,
    resolutionScale,
    new Cartesian2()
  );

  if (!hasDimensions) {
    return null;
  }

  const { x, y } = pixelDimensions;

  if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) {
    console.warn("Cesium camera pixel dimensions are not useable");
    return null;
  }

  return {
    x,
    y,
    average: (x + y) / 2,
  };
};
