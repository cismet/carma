import { type Scene, PerspectiveFrustum, isValidScene } from "@carma/cesium";

import { CssPixelHeight, CssPixelWidth } from "@carma/units/types";
import { getWindowDimensions } from "@carma-commons/dom/window";
import { getCanvasDimensions } from "@carma-commons/dom/canvas";

const getSceneSyncedSize = (
  scene: Scene | null,
  overrideFov?: number
): number | undefined => {
  const wDim = getWindowDimensions(window);
  const maxWindow = Math.max(wDim.width, wDim.height);

  let maxCanvas: number | undefined;
  let frustum: unknown;

  if (isValidScene(scene) && scene.canvas) {
    const { width, height } = getCanvasDimensions(
      scene.canvas as HTMLCanvasElement
    );
    maxCanvas = Math.max(width, height);
    frustum = scene.camera?.frustum;
  }

  // use maxCanvas if available, otherwise fall back to maxWindow
  const dim = maxCanvas && maxCanvas > 0 ? maxCanvas : maxWindow;

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
    console.debug("getSceneSyncedSize: unsupported or missing frustum; skip");
    return;
  }
};

export const getSceneSyncedDimensions = (
  scene: Scene | null,
  isVertical: boolean,
  imageAspectRatio: number,
  baseScaleFactor: number,
  overrideFov?: number
): { syncedWidth: CssPixelWidth; syncedHeight: CssPixelHeight } => {
  const widthScaleFactor =
    baseScaleFactor * (isVertical ? imageAspectRatio : 1);
  const heightScaleFactor =
    baseScaleFactor * (isVertical ? 1 : 1 / imageAspectRatio);

  const baseSize = Number(getSceneSyncedSize(scene, overrideFov));
  const syncedWidth = (baseSize * widthScaleFactor) as CssPixelWidth;
  const syncedHeight = (baseSize * heightScaleFactor) as CssPixelHeight;

  return { syncedWidth, syncedHeight };
};
