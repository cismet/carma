import {
  type Camera,
  Cartesian2,
  Cartesian3,
  defined,
  type Scene,
} from "@carma/cesium";

// Mercator helpers are provided by @carma-commons/utils/mercator; no re-exports here.

import type { NumericResult } from "@carma/types";
import { Meters, Radians } from "@carma/units/types";
import { getZoomFromPixelResolutionAtLatitudeRad } from "@carma/geo/utils";
import { generatePositionsForRing } from "../geometry";
import { PICKMODE, pickScenePositions, pickSceneCenter } from "./pickers";
import { isValidScene } from "@carma/cesium";

export const getPixelSizeForPosition = (
  position: Cartesian3 | null,
  camera: Camera, // validate Camera existence outside of this
  drawingBufferWidth: number,
  drawingBufferHeight: number
) => {
  if (defined(position)) {
    // Calculate pixel size directly without creating BoundingSphere for better performance
    const distance = Cartesian3.distance(position, camera.position);
    const pixelDimensions = camera.frustum.getPixelDimensions(
      drawingBufferWidth,
      drawingBufferHeight,
      distance,
      1,
      new Cartesian2()
    );
    return Math.max(pixelDimensions.x, pixelDimensions.y);
  }
  return null;
};

const sampleRingPixelSize = (scene: Scene, samples: number, radius: number) => {
  const positionCoords = generatePositionsForRing(samples, radius);
  const positions = pickScenePositions(scene, positionCoords);
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
  if (!scene && !isValidScene(scene)) return { value: null };

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
      const centerPos = pickSceneCenter(scene, {
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

export const cesiumCenterPixelSizeToLeafletZoom = (
  scene: Scene
): NumericResult => {
  const pixelSize = getScenePixelSize(scene, PICKMODE.RING);
  if (pixelSize.value === null) {
    console.warn("No pixel size found for camera position.", pixelSize.error);
    return { value: null, error: "No pixel size found for camera position" };
  }
  const px = pixelSize.value;
  if (px === null) {
    return { value: null, error: "No pixel size found for camera position" };
  }
  let result: NumericResult = { value: null, error: "no camera found" };
  // Apply inverse DPR factor for Leaflet compatibility
  // Leaflet uses retina tiles but logical zoom levels, so we need to adjust
  const actualDPR = window.devicePixelRatio || 1;
  const LEAFLET_DPR_FACTOR = 1 / actualDPR;
  const adjustedPixelResolution = (px / LEAFLET_DPR_FACTOR) as Meters;
  
  console.debug(
    `[CESIUM->LEAFLET] Converting px=${px.toFixed(4)}m/px with DPR=${actualDPR} → adjusted=${adjustedPixelResolution.toFixed(4)}m/px`
  );
  
  const zoom = getZoomFromPixelResolutionAtLatitudeRad(
    adjustedPixelResolution,
    scene.camera.positionCartographic.latitude as Radians
  );

  if (zoom === Infinity) {
    console.warn("zoom is infinity, skipping");
    result = { value: null, error: "Zoom is infinity" };
  } else {
    result = { value: zoom };
  }
  return result;
};
