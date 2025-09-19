import { CssPixelHeight, CssPixelWidth } from "@carma/types";
import { getWindowDimensions } from "@carma-commons/utils";
import { getCanvasDimensions } from "@carma-commons/utils/canvas";
import { useCesiumContext } from "@carma-mapping/engines/cesium";
import { PerspectiveFrustum } from "cesium";

const getCesiumSyncedSize = (
  ctx: ReturnType<typeof useCesiumContext>,
  overrideFov?: number
): number | undefined => {
  let maxCanvas: number | undefined;
  let frustum: unknown;

  const wDim = getWindowDimensions(window);
  if (!wDim) return;
  const maxWindow = Math.max(wDim.width, wDim.height);

  ctx.withWidget((w) => {
    const { width, height } = getCanvasDimensions(w.canvas);
    maxCanvas = Math.max(width, height);
    frustum = w?.scene?.camera?.frustum;
  });

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
    console.debug("getCesiumSyncedSize: unsupported or missing frustum; skip");
    return;
  }
};

export const getCesiumSyncedDimensions = (
  ctx: ReturnType<typeof useCesiumContext>,
  isVertical: boolean,
  imageAspectRatio: number,
  baseScaleFactor: number,
  overrideFov?: number
): { syncedWidth: CssPixelWidth; syncedHeight: CssPixelHeight } => {
  const widthScaleFactor =
    baseScaleFactor * (isVertical ? imageAspectRatio : 1);
  const heightScaleFactor =
    baseScaleFactor * (isVertical ? 1 : 1 / imageAspectRatio);

  const baseSize = Number(getCesiumSyncedSize(ctx, overrideFov));
  const syncedWidth = (baseSize * widthScaleFactor) as CssPixelWidth;
  const syncedHeight = (baseSize * heightScaleFactor) as CssPixelHeight;

  return { syncedWidth, syncedHeight };
};
