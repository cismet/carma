import { CssPixelHeight, CssPixelWidth } from "@carma/units/types";
import { getWindowDimensions } from "@carma-commons/dom/window";
import { getCanvasDimensions } from "@carma-commons/dom/canvas";
import { useCesiumContext } from "@carma-mapping/engines/cesium";
import { PerspectiveFrustum } from "cesium";

const getViewerSyncedSize = (
  ctx: ReturnType<typeof useCesiumContext>,
  overrideFov?: number
): number | undefined => {
  let maxCanvas: number | undefined;
  let frustum: unknown;

  const wDim = getWindowDimensions(window);
  const maxWindow = Math.max(wDim.width, wDim.height);

  ctx.withViewer((viewer) => {
    const { width, height } = getCanvasDimensions(viewer.canvas);
    maxCanvas = Math.max(width, height);
    frustum = viewer?.scene?.camera?.frustum;
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
    console.debug("getViewerSyncedSize: unsupported or missing frustum; skip");
    return;
  }
};

export const getViewerSyncedDimensions = (
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

  const baseSize = Number(getViewerSyncedSize(ctx, overrideFov));
  const syncedWidth = (baseSize * widthScaleFactor) as CssPixelWidth;
  const syncedHeight = (baseSize * heightScaleFactor) as CssPixelHeight;

  return { syncedWidth, syncedHeight };
};
