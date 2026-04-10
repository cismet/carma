import {
  PerspectiveFrustum,
  type PerspectiveFrustum as PerspectiveFrustumLike,
  type Scene,
} from "@carma-cesium";
import { CssPixelHeight, CssPixelWidth } from "@carma-units";
import { getWindowDimensions } from "@carma-commons/dom/window";
import { getCanvasDimensions } from "@carma-commons/dom/canvas";
import { useCesiumContext } from "@carma-mapping/engines/cesium/legacy";

const readViewerSyncedSizeFromViewport = (
  maxViewportDimension: number,
  frustum: PerspectiveFrustumLike | null,
  overrideFov?: number
): number | undefined => {
  const dim =
    typeof maxViewportDimension === "number" &&
    Number.isFinite(maxViewportDimension) &&
    maxViewportDimension > 0
      ? maxViewportDimension
      : undefined;
  const fov =
    typeof overrideFov === "number"
      ? overrideFov
      : frustum instanceof PerspectiveFrustum
      ? frustum.fov
      : undefined;

  if (typeof dim !== "number" || typeof fov !== "number") {
    return undefined;
  }

  const fovFactor = Math.tan(fov / 2);
  return Number.isFinite(fovFactor) && fovFactor > 0
    ? Math.max(1, dim / fovFactor)
    : undefined;
};

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

  const syncedSize = readViewerSyncedSizeFromViewport(
    maxCanvas > 0 ? maxCanvas : maxWindow,
    frustum instanceof PerspectiveFrustum ? frustum : null,
    overrideFov
  );

  if (typeof syncedSize !== "number") {
    console.debug("getViewerSyncedSize: unsupported or missing frustum; skip");
    return Math.max(1, maxCanvas > 0 ? maxCanvas : maxWindow);
  }

  return syncedSize;
};

export const getSceneSyncedDimensions = (
  scene: Scene,
  isVertical: boolean,
  imageAspectRatio: number,
  baseScaleFactor: number,
  overrideFov?: number
): { syncedWidth: CssPixelWidth; syncedHeight: CssPixelHeight } => {
  const width = Math.max(
    1,
    scene.canvas?.clientWidth || scene.canvas?.width || 1
  );
  const height = Math.max(
    1,
    scene.canvas?.clientHeight || scene.canvas?.height || 1
  );
  const baseSize = Number(
    readViewerSyncedSizeFromViewport(
      Math.max(width, height),
      scene.camera.frustum instanceof PerspectiveFrustum
        ? scene.camera.frustum
        : null,
      overrideFov
    ) ?? Math.max(width, height)
  );
  const widthScaleFactor =
    baseScaleFactor * (isVertical ? imageAspectRatio : 1);
  const heightScaleFactor =
    baseScaleFactor * (isVertical ? 1 : 1 / imageAspectRatio);

  return {
    syncedWidth: (baseSize * widthScaleFactor) as CssPixelWidth,
    syncedHeight: (baseSize * heightScaleFactor) as CssPixelHeight,
  };
};

export const getViewerSyncedDimensions = (
  ctx: ReturnType<typeof useCesiumContext>,
  isVertical: boolean,
  imageAspectRatio: number,
  baseScaleFactor: number,
  overrideFov?: number
): { syncedWidth: CssPixelWidth; syncedHeight: CssPixelHeight } => {
  const baseSize = Number(getViewerSyncedSize(ctx, overrideFov) ?? 1);
  const widthScaleFactor =
    baseScaleFactor * (isVertical ? imageAspectRatio : 1);
  const heightScaleFactor =
    baseScaleFactor * (isVertical ? 1 : 1 / imageAspectRatio);
  const syncedWidth = (baseSize * widthScaleFactor) as CssPixelWidth;
  const syncedHeight = (baseSize * heightScaleFactor) as CssPixelHeight;

  return { syncedWidth, syncedHeight };
};
