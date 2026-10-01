/// <reference lib="webworker" />
import { resamplePreviewRgb } from "../../core/utils/resample-preview-rgb";
import type { DevicePixels } from "@carma-units";

self.onmessage = (
  event: MessageEvent<{
    bitmap: ImageBitmap;
    sourceWidth: DevicePixels;
    sourceHeight: DevicePixels;
    width: DevicePixels;
    height: DevicePixels;
    sample: {
      x: DevicePixels;
      y: DevicePixels;
      width: DevicePixels;
      height: DevicePixels;
    };
  }>
) => {
  const p = event.data;
  let canvas: OffscreenCanvas | null = null;
  try {
    canvas = new OffscreenCanvas(p.bitmap.width, p.bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("No RGB decode canvas");
    context.drawImage(p.bitmap, 0, 0);
    const input = context.getImageData(0, 0, p.bitmap.width, p.bitmap.height);
    const pixels = resamplePreviewRgb(
      input.data,
      p.sourceWidth,
      p.sourceHeight,
      p.width,
      p.height,
      p.sample
    );
    self.postMessage({ pixels: pixels.buffer }, [pixels.buffer]);
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    p.bitmap.close();
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
  }
};
