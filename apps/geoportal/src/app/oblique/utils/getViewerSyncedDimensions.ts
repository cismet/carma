import { PerspectiveFrustum, type Scene } from "cesium";

import { CssPixelHeight, CssPixelWidth } from "@carma/types";
import { getWindowDimensions } from "@carma-commons/utils";
import { getCanvasDimensions } from "@carma-commons/utils/canvas";
import { tryWithValidScene } from "@carma-mapping/engines/cesium";

const isSupportedFrustum = (
  frustum: unknown
): frustum is PerspectiveFrustum => {
  return frustum instanceof PerspectiveFrustum;
};

const getSceneSyncedSize = (scene: Scene, overrideFov?: number): number => {
  let maxCanvas: number | undefined;
  let frustum: PerspectiveFrustum;
  let width = 0;
  let height = 0;

  const wDim = getWindowDimensions(window);
  if (!wDim) return;
  const maxWindow = Math.max(wDim.width, wDim.height);

  tryWithValidScene(scene, (scene) => {
    const { canvas, camera } = scene;
    ({ width, height } = getCanvasDimensions(canvas));
    maxCanvas = Math.max(width, height);
    if (isSupportedFrustum(camera?.frustum)) {
      frustum = camera.frustum;
    }
  });

  if (!frustum) {
    throw new Error("getSceneSyncedSize: unsupported or missing frustum; skip");
  }

  // use maxCanvas if available, otherwise fall back to maxWindow
  const dim = maxCanvas > 0 ? maxCanvas : maxWindow;

  const fov =
    typeof overrideFov === "number"
      ? overrideFov
      : frustum instanceof PerspectiveFrustum
      ? frustum.fov
      : undefined;
  if (typeof fov === "number") {
    const fovFactor = Math.tan(fov / 2);
    return Math.max(1, dim / fovFactor);
  } else {
    throw new Error("getSceneSyncedSize: unsupported or missing frustum; skip");
  }
};

export const getSceneSyncedDimensions = (
  scene: Scene,
  isVertical: boolean,
  imageAspectRatio: number,
  baseScaleFactor: number,
  overrideFov?: number
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
