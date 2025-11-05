import { NumericResult } from "@carma/types";
// todo move @carma/geo versions after validation

import {
  type Camera,
  Cartesian3,
  defined,
  Scene,
  PerspectiveFrustum,
  getFrustumPixelDimensionsForDistance,
} from "@carma/cesium";
import { generatePositionsForRing } from "./geometryGenerators";
import {
  PICKMODE,
  pickSceneCanvasPositions,
  pickSceneCanvasCenter,
} from "./pickers";

export const getPixelSizeForPosition = (
  position: Cartesian3 | null,
  camera: Camera, // validate Camera existence outside of this
  drawingBufferWidth: number,
  drawingBufferHeight: number
) => {
  if (defined(position)) {
    // Calculate pixel size directly without creating BoundingSphere for better performance
    const distance = Cartesian3.distance(position, camera.position);

    if (!(camera.frustum instanceof PerspectiveFrustum)) {
      return null;
    }

    const pixelDimensions = getFrustumPixelDimensionsForDistance(
      camera.frustum,
      drawingBufferWidth,
      drawingBufferHeight,
      distance,
      1 // resolutionScale
    );

    if (!pixelDimensions) {
      return null;
    }

    return Math.max(pixelDimensions.x, pixelDimensions.y);
  }
  return null;
};

const sampleRingPixelSize = (scene: Scene, samples: number, radius: number) => {
  const positionCoords = generatePositionsForRing(samples, radius);
  const positions = pickSceneCanvasPositions(scene, positionCoords);
  const pixelSizes: (number | null)[] = [];

  const { drawingBufferWidth, drawingBufferHeight, camera } = scene;
  positions.forEach(({ scenePosition }) => {
    const pixelSize = getPixelSizeForPosition(
      scenePosition,
      camera,
      drawingBufferWidth,
      drawingBufferHeight
    );
    pixelSizes.push(pixelSize);
  });

  const validPixelSizes = pixelSizes.filter(
    (pixelSize): pixelSize is number =>
      pixelSize !== null &&
      typeof pixelSize === "number" &&
      pixelSize !== 0 &&
      pixelSize !== Infinity &&
      !isNaN(pixelSize)
  );
  const sortedPixelSizes = validPixelSizes.sort(
    (a: number, b: number) => a - b
  );
  // Drop the extremes
  const drop = Math.floor(sortedPixelSizes.length / 4);
  const trimmedPixelSizes = sortedPixelSizes.slice(drop, -drop);
  // Calculate the average of the middle values
  const sum = trimmedPixelSizes.reduce((a, b) => a + b, 0);
  const avg = sum / trimmedPixelSizes.length;
  console.debug("pixel sizes", sortedPixelSizes, trimmedPixelSizes, avg);
  return avg;
};

export const getScenePixelSize = (
  scene: Scene,
  mode = PICKMODE.CENTER,
  { samples = 10, radius = 0.2 }: { samples?: number; radius?: number } = {}
): NumericResult => {
  // sample two position to get better approximation for full view extent
  if (radius >= 0.5) {
    console.warn(
      "radius is greater than 0.5, clamping applied",
      radius,
      samples
    );
    radius = 0.5;
  }

  let result: NumericResult = { value: null };

  switch (mode) {
    case PICKMODE.RING: {
      if (radius > 0) {
        result.value = sampleRingPixelSize(scene, samples, radius);
        break;
      }
      console.warn("radius is 0, skipping");
      break;
    }
    case PICKMODE.CENTER:
    default: {
      const centerPos = pickSceneCanvasCenter(scene, {
        getPixelSize: true,
      });
      result.value = centerPos.pixelSize;
    }
  }

  if (result.value === 0 || result.value === Infinity) {
    result = {
      value: null,
      error: "No pixel size found for camera position",
    };
  }

  return result;
};
