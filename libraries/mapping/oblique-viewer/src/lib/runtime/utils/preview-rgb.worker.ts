/// <reference lib="webworker" />
import { resamplePreviewRgb } from "../../core/utils/resample-preview-rgb";
import type { DevicePixels } from "@carma-units";

self.onmessage = (
  event: MessageEvent<{
    pixels: ArrayBuffer;
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
  try {
    const pixels = resamplePreviewRgb(
      new Uint8ClampedArray(p.pixels),
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
  }
};
