import { Cartesian3, type Scene } from "@carma-cesium";
import { readMetersPerCssPixelFromIntrinsics } from "@carma-commons/camera/model";

import { readSceneCameraIntrinsics } from "../camera/Intrinsics";

/**
 * Screen (CSS) pixels per world metre for an object at `worldPoint`'s depth —
 * the scene's on-screen display scale at that range.
 *
 * This is the inverse of the same quantity the shared view-state derives
 * (`readMetersPerCssPixelFromIntrinsics` in `@carma-commons/camera/model`):
 * camera intrinsics + line-of-sight range + CSS viewport. It therefore depends
 * only on zoom (range/FOV/viewport), not on camera orientation — orbiting or
 * panning at a fixed zoom leaves it unchanged. Returns 0 when it cannot be
 * determined (range collapses to ~0 at the camera, or intrinsics are missing).
 * Note: range is an unsigned distance, so a point strictly behind the camera
 * yields the same scale as one the same distance in front — callers pass points
 * that are in view (e.g. the selected node under the visible gizmo).
 *
 * Callers that already track the scene scale (e.g. via the view-state) should
 * prefer that value directly; this is the engine-level derivation for code that
 * only has a `Scene`.
 */
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
