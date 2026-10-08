import type { DevicePixels } from "@carma-units";
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
    /** Raw TIFF input can stage small surfaces; native image bitmaps use one whole-viewport draw. */
    tileEdge?: number;
  }
) => {
  const sx = sourceSize.width / nativeSize.width;
  const sy = sourceSize.height / nativeSize.height;
  const edge = options.tileEdge ?? Math.max(window.target.width, window.target.height);
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
      const left = (window.source.x + x * window.source.width / window.target.width) * sx;
      const top = (window.source.y + y * window.source.height / window.target.height) * sy;
      const right = left + width * window.source.width / window.target.width * sx;
      const bottom = top + height * window.source.height / window.target.height * sy;
      await paint([
        Math.max(0, left), Math.max(0, top),
        Math.min(sourceSize.width, right), Math.min(sourceSize.height, bottom),
      ], { x, y, width, height });
      options.signal.throwIfAborted();
      if (edge < Math.max(window.target.width, window.target.height))
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
};
