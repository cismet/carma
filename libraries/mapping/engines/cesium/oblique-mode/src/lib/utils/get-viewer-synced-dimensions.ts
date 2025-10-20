import { type PerspectiveFrustum, type Scene } from "@carma/cesium";

import type {
  CssPixelHeight,
  CssPixelWidth,
  Radians,
} from "@carma/units/types";
import { getWindowDimensions } from "@carma-commons/dom/window";
import { getCanvasDimensions } from "@carma-commons/dom/canvas";
import {
  isValidFov,
  tryWithValidScene,
} from "@carma-mapping/engines/cesium/core";
import { isPerspectiveFrustum } from "@carma/cesium";

const getSceneSyncedSize = (scene: Scene, overrideFov?: Radians): number => {
  let syncedSize: number | null = null;
  tryWithValidScene(scene, (scene) => {
    const wDim = getWindowDimensions(window);

    const maxWindow: number = Math.max(wDim.width, wDim.height);

    const { canvas, camera } = scene;
    const { frustum } = camera;

    if (!isPerspectiveFrustum(frustum)) {
      throw new Error(
        "getSceneSyncedSize: unsupported or missing frustum; skip"
      );
    }

    const { width, height } = getCanvasDimensions(canvas);
    const maxCanvas = Math.max(width, height);

    // use maxCanvas if available, otherwise fall back to maxWindow
    const dim = maxCanvas > 0 ? maxCanvas : maxWindow;

    if (overrideFov !== undefined && !isValidFov(overrideFov)) {
      throw new Error("getSceneSyncedSize: invalid override fov supplied");
    }

    const hasOverrideFov = overrideFov !== undefined;
    // frustum is now properly typed as PerspectiveFrustum after the type guard
    const cameraFov = frustum.fov;

    if (!hasOverrideFov && !isValidFov(cameraFov)) {
      throw new Error("getSceneSyncedSize: invalid fov fetched from camera");
    }

    const appliedFov = hasOverrideFov ? overrideFov : (cameraFov as Radians);

    if (!isValidFov(appliedFov)) {
      throw new Error("getSceneSyncedSize: invalid fov applied");
    }

    const fovFactor = Math.tan(appliedFov / 2);
    syncedSize = Math.max(1, dim / fovFactor);
    console.debug(
      "getSceneSyncedSize: fov",
      appliedFov,
      "fovFactor",
      fovFactor,
      "syncedSize",
      syncedSize
    );
  });

  if (syncedSize === null) {
    throw new Error("getSceneSyncedSize: failed to get synced size");
  }

  return syncedSize;
};

export const getSceneSyncedDimensions = (
  scene: Scene,
  isVertical: boolean,
  imageAspectRatio: number,
  baseScaleFactor: number,
  overrideFov?: Radians
): { syncedWidth: CssPixelWidth; syncedHeight: CssPixelHeight } => {
  const widthScaleFactor =
    baseScaleFactor * (isVertical ? imageAspectRatio : 1);
  const heightScaleFactor =
    baseScaleFactor * (isVertical ? 1 : 1 / imageAspectRatio);

  try {
    const baseSize = Number(getSceneSyncedSize(scene, overrideFov));
    const syncedWidth = (baseSize * widthScaleFactor) as CssPixelWidth;
    const syncedHeight = (baseSize * heightScaleFactor) as CssPixelHeight;

    return { syncedWidth, syncedHeight };
  } catch (e) {
    console.error("getSceneSyncedDimensions: failed to get synced size", e);
    throw e;
  }
};
