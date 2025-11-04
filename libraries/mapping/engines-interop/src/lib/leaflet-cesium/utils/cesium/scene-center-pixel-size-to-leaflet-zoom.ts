import { type Scene } from "@carma/cesium";
import type { Meters, Radians } from "@carma/units/types";
import type { NumericResult } from "@carma/types";
import {
  getScenePixelSize,
  PICKMODE,
} from "@carma-mapping/engines/cesium/legacy";
import { getZoomFromPixelResolutionAtLatitudeRad } from "@carma/geo/utils";

export const sceneCenterPixelSizeToLeafletZoom = (
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
  const { camera } = scene;
  const zoom = getZoomFromPixelResolutionAtLatitudeRad(
    px as Meters,
    camera.positionCartographic.latitude as Radians
  );

  if (zoom === Infinity) {
    console.warn("zoom is infinity, skipping");
    result = { value: null, error: "Zoom is infinity" };
  } else {
    result = { value: zoom };
  }
  return result;
};
