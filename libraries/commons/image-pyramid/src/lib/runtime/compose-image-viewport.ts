import type { DevicePixels, Ratio } from "@carma-units";
import type { NativePreviewWindow } from "../core/image-viewport-window";

export type ImageViewportDestination = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

/** Compose prefiltered source pixels with native linear scaling; never read them back to RGB. */
export const composeImageViewport = async (
  context: OffscreenCanvasRenderingContext2D,
  window: NativePreviewWindow,
  nativeSize: { width: DevicePixels; height: DevicePixels },
  sourceSize: { width: number; height: number },
  paint: (
    bounds: [number, number, number, number],
    destination: ImageViewportDestination
  ) => Promise<void> | void,
  options: {
    signal: AbortSignal;
    shouldYield?: () => boolean;
    /** Stored pixels per calibrated native pixel; avoids ratios of rounded level extents. */
    sourceScale?: Readonly<{ x: Ratio; y: Ratio }>;
    /** Limit temporary composition surfaces when a caller needs bounded staging. */
    tileEdge?: number;
  }
) => {
  const sx = options.sourceScale?.x ?? sourceSize.width / nativeSize.width;
  const sy = options.sourceScale?.y ?? sourceSize.height / nativeSize.height;
  if (![sx, sy].every((scale) => Number.isFinite(scale) && scale > 0))
    throw new RangeError(
      "Composition source scale must be finite and positive"
    );
  const sourceWidth = Math.min(sourceSize.width, nativeSize.width * sx);
  const sourceHeight = Math.min(sourceSize.height, nativeSize.height * sy);
  const edge =
    options.tileEdge ?? Math.max(window.target.width, window.target.height);
  if (!Number.isSafeInteger(edge) || edge < 1)
    throw new RangeError("Composition tile edge must be a positive integer");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "low";
  context.clearRect(0, 0, window.target.width, window.target.height);
  for (let y = 0; y < window.target.height; y += edge) {
    for (let x = 0; x < window.target.width; x += edge) {
      options.signal.throwIfAborted();
      while (options.shouldYield?.()) {
        await new Promise<void>((resolve) => setTimeout(resolve, 4));
        options.signal.throwIfAborted();
      }
      const width = Math.min(edge, window.target.width - x);
      const height = Math.min(edge, window.target.height - y);
      const left =
        (window.source.x + (x * window.source.width) / window.target.width) *
        sx;
      const top =
        (window.source.y + (y * window.source.height) / window.target.height) *
        sy;
      const right =
        left + ((width * window.source.width) / window.target.width) * sx;
      const bottom =
        top + ((height * window.source.height) / window.target.height) * sy;
      const clippedLeft = Math.max(0, left),
        clippedTop = Math.max(0, top);
      const clippedRight = Math.min(sourceWidth, right),
        clippedBottom = Math.min(sourceHeight, bottom);
      if (clippedRight > clippedLeft && clippedBottom > clippedTop)
        await paint([clippedLeft, clippedTop, clippedRight, clippedBottom], {
          x: x + ((clippedLeft - left) * width) / (right - left),
          y: y + ((clippedTop - top) * height) / (bottom - top),
          width:
            clippedLeft === left && clippedRight === right
              ? width
              : ((clippedRight - clippedLeft) * width) / (right - left),
          height:
            clippedTop === top && clippedBottom === bottom
              ? height
              : ((clippedBottom - clippedTop) * height) / (bottom - top),
        });
      options.signal.throwIfAborted();
      if (edge < Math.max(window.target.width, window.target.height))
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
};
