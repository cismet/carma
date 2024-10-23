import { Cartesian2, Viewer } from "cesium";

export const getCesiumCameraPixelDimensionForDistance = (
  viewer: Viewer,
  distance: number,
) => {
  const { scene, camera } = viewer;

  const pixelDimensions = camera.frustum.getPixelDimensions(
    scene.drawingBufferWidth,
    scene.drawingBufferHeight,
    distance,
    viewer.resolutionScale,
    new Cartesian2(),
  );

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
