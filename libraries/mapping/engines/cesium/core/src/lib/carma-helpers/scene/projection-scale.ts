import { Cartesian3, type Scene } from "@carma-cesium";
import { readMetersPerCssPixelFromIntrinsics } from "@carma-commons/camera/model";

import { readSceneCameraIntrinsics } from "../camera/Intrinsics";

/** Screen pixels per world metre at the point's camera range. */
export const getScreenPixelsPerMeterAtWorldPoint = (
  scene: Scene,
  worldPoint: Cartesian3
): number => {
  const rangeM = Cartesian3.distance(scene.camera.positionWC, worldPoint);
  if (!Number.isFinite(rangeM) || rangeM <= 0) {
    return 0;
  }

  const { canvas } = scene;
  const metersPerCssPixel = readMetersPerCssPixelFromIntrinsics({
    intrinsics: readSceneCameraIntrinsics(scene),
    rangeM,
    viewportWidthPx: canvas.clientWidth,
    viewportHeightPx: canvas.clientHeight,
  });

  return metersPerCssPixel && metersPerCssPixel > 0 ? 1 / metersPerCssPixel : 0;
};
