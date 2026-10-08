import type { DevicePixels } from "@carma-units";
import { nativePreviewTiles, type NativePreviewWindow } from "../core/image-viewport-window";
import { resamplePreviewRgb } from "../core/resample-preview-rgb";

/** Shared foreground/speculative composition; only bounded physical-pixel crops are staged. */
export const composeImageViewport = async (
  context: OffscreenCanvasRenderingContext2D,
  window: NativePreviewWindow,
  nativeSize: { width: DevicePixels; height: DevicePixels },
  sourceSize: { width: number; height: number },
  read: (bounds: [number, number, number, number]) => Promise<Uint8ClampedArray>,
  options: { signal: AbortSignal; shouldYield?: () => boolean; onWorkingBytes?: (bytes: number) => void }
) => {
  const sx = sourceSize.width / nativeSize.width, sy = sourceSize.height / nativeSize.height;
  for (const tile of nativePreviewTiles(window, nativeSize, 512)) {
    options.signal.throwIfAborted();
    while (options.shouldYield?.()) {
      await new Promise<void>((resolve) => setTimeout(resolve, 4));
      options.signal.throwIfAborted();
    }
    const x = Math.floor(tile.source.x * sx), y = Math.floor(tile.source.y * sy),
      right = Math.min(sourceSize.width, Math.ceil((tile.source.x + tile.source.width) * sx)),
      bottom = Math.min(sourceSize.height, Math.ceil((tile.source.y + tile.source.height) * sy));
    const input = await read([x, y, right, bottom]);
    options.signal.throwIfAborted();
    options.onWorkingBytes?.(input.byteLength);
    const pixels = resamplePreviewRgb(input, (right - x) as DevicePixels, (bottom - y) as DevicePixels,
      tile.target.width, tile.target.height, {
        x: ((tile.sample.x - x / sx) * sx) as DevicePixels,
        y: ((tile.sample.y - y / sy) * sy) as DevicePixels,
        width: (tile.sample.width * sx) as DevicePixels,
        height: (tile.sample.height * sy) as DevicePixels,
      });
    options.onWorkingBytes?.(input.byteLength + pixels.byteLength);
    context.putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer), tile.target.width, tile.target.height),
      tile.target.x, tile.target.y);
    options.onWorkingBytes?.(0);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
};
