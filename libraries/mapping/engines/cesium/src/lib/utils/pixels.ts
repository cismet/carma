// Mercator helpers are provided by @carma-commons/utils/mercator; no re-exports here.

import { NumericResult } from "@carma-commons/types";
import {
  asMeters,
  asRadians,
  getZoomFromPixelResolutionAtLatitudeRad,
} from "@carma-commons/utils";
import { type Camera, Cartesian2, Cartesian3, defined } from "cesium";
import { CesiumContextType } from "../CesiumContext";
import { generatePositionsForRing } from "./geometryGenerators";
import {
  PICKMODE,
  pickViewerCanvasPositions,
  pickViewerCanvasCenter,
} from "./pickers";

export const getPixelSizeForPosition = (
  position: Cartesian3 | null,
  camera: Camera, // validate Camera existance outside of this
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

const sampleRingPixelSize = (
  ctx: CesiumContextType,
  samples: number,
  radius: number
) => {
  const positionCoords = generatePositionsForRing(samples, radius);
  const positions = pickViewerCanvasPositions(ctx, positionCoords);
  const pixelSizes: (number | null)[] = [];

  ctx.withViewer((viewer) => {
    const { drawingBufferWidth, drawingBufferHeight } = viewer.scene;
    positions.forEach(({ scenePosition }) => {
      const pixelSize = getPixelSizeForPosition(
        scenePosition,
        viewer.camera,
        drawingBufferWidth,
        drawingBufferHeight
      );
      pixelSizes.push(pixelSize);
    });
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
  ctx: CesiumContextType,
  mode = PICKMODE.CENTER,
  { samples = 10, radius = 0.2 }: { samples?: number; radius?: number } = {}
): NumericResult => {
  if (!ctx.isValidViewer()) return { value: null };

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
        result.value = sampleRingPixelSize(ctx, samples, radius);
        break;
      }
      console.warn("radius is 0, skipping");
      break;
    }
    case PICKMODE.CENTER:
    default: {
      const centerPos = pickViewerCanvasCenter(ctx, {
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
  ctx: CesiumContextType
): NumericResult => {
  const pixelSize = getScenePixelSize(ctx, PICKMODE.RING);
  if (pixelSize.value === null) {
    console.warn("No pixel size found for camera position.", pixelSize.error);
    return { value: null, error: "No pixel size found for camera position" };
  }
  const px = pixelSize.value;
  if (px === null) {
    return { value: null, error: "No pixel size found for camera position" };
  }
  let result: NumericResult = { value: null, error: "no camera found" };
  ctx.withCamera((camera) => {
    const zoom = getZoomFromPixelResolutionAtLatitudeRad(
      asMeters(px),
      asRadians(camera.positionCartographic.latitude)
    );

    if (zoom === Infinity) {
      console.warn("zoom is infinity, skipping");
      result = { value: null, error: "Zoom is infinity" };
    } else {
      result = { value: zoom };
    }
  });
  return result;
};
