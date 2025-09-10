import { CssPixelHeight, CssPixelWidth } from "@carma-commons/types";
import { getWindowDimensions } from "@carma-commons/utils";
import { getCanvasDimensions } from "@carma-commons/utils/canvas";
import { useCesiumContext } from "@carma-mapping/engines/cesium";
import { PerspectiveFrustum } from "cesium";

const getViewerSyncedSize = (
  ctx: ReturnType<typeof useCesiumContext>
): number | undefined => {
  let maxCanvas = 0;
  let frustum: unknown | null = null;

  const wDim = getWindowDimensions(window);
  const maxWindow = Math.max(wDim.width, wDim.height);

  ctx.withViewer((viewer) => {
    const { width, height } = getCanvasDimensions(viewer.canvas);
    maxCanvas = Math.max(width, height);
    frustum = viewer?.scene?.camera?.frustum;
  });
  const dim = maxCanvas > 0 ? maxCanvas : maxWindow;

  if (frustum instanceof PerspectiveFrustum) {
    const fovFactor = Math.tan(frustum.fov / 2);
    return Math.max(1, dim / fovFactor);
  } else {
    console.warn("Unsupported frustum type");
    return;
  }
};

export const getViewerSyncedDimensions = (
  ctx: ReturnType<typeof useCesiumContext>,
  isVertical: boolean,
  imageAspectRatio: number,
  baseScaleFactor: number
): { syncedWidth: CssPixelWidth; syncedHeight: CssPixelHeight } => {
  const widthScaleFactor =
    baseScaleFactor * (isVertical ? imageAspectRatio : 1);
  const heightScaleFactor =
    baseScaleFactor * (isVertical ? 1 : 1 / imageAspectRatio);

  const syncedWidth = (getViewerSyncedSize(ctx) *
    widthScaleFactor) as CssPixelWidth;
  const syncedHeight = (getViewerSyncedSize(ctx) *
    heightScaleFactor) as CssPixelHeight;

  return { syncedWidth, syncedHeight };
};
