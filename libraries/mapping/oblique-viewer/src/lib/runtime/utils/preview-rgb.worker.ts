/// <reference lib="webworker" />
import { resamplePreviewRgb } from "../../core/utils/resample-preview-rgb";
import {
  nativePreviewTiles,
  type NativePreviewWindow,
} from "../../core/utils/native-preview-window";
import type { DevicePixels } from "@carma-units";

self.onmessage = async (
  event: MessageEvent<{
    url: string;
    window: NativePreviewWindow;
    nativeSize: { width: DevicePixels; height: DevicePixels };
    flipForTexture: boolean;
  }>
) => {
  const request = event.data;
  let output: OffscreenCanvas | null = null;
  let bitmap: ImageBitmap | null = null;
  try {
    output = new OffscreenCanvas(
      request.window.target.width,
      request.window.target.height
    );
    const target = output.getContext("2d");
    if (!target) throw new Error("No RGB composition canvas");
    for (const tile of nativePreviewTiles(request.window, request.nativeSize)) {
      const url = new URL(request.url);
      Object.entries({ ...tile.source, edge: tile.edge }).forEach(
        ([name, value]) => url.searchParams.set(name, String(value))
      );
      const response = await fetch(url);
      if (!response.ok)
        throw new Error("Native RGB preview: " + response.status);
      bitmap = await createImageBitmap(await response.blob());
      const decode = new OffscreenCanvas(bitmap.width, bitmap.height);
      try {
        const context = decode.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("No RGB decode canvas");
        context.drawImage(bitmap, 0, 0);
        const input = context.getImageData(0, 0, bitmap.width, bitmap.height);
        const scaleX = bitmap.width / tile.source.width;
        const scaleY = bitmap.height / tile.source.height;
        const pixels = resamplePreviewRgb(
          input.data,
          bitmap.width as DevicePixels,
          bitmap.height as DevicePixels,
          tile.target.width,
          tile.target.height,
          {
            x: ((tile.sample.x - tile.source.x) * scaleX) as DevicePixels,
            y: ((tile.sample.y - tile.source.y) * scaleY) as DevicePixels,
            width: (tile.sample.width * scaleX) as DevicePixels,
            height: (tile.sample.height * scaleY) as DevicePixels,
          }
        );
        target.putImageData(
          new ImageData(
            new Uint8ClampedArray(pixels.buffer),
            tile.target.width,
            tile.target.height
          ),
          tile.target.x,
          tile.target.y
        );
      } finally {
        bitmap.close();
        bitmap = null;
        decode.width = 1;
        decode.height = 1;
      }
    }
    // ImageBitmap WebGL uploads ignore Texture.flipY; orient the pixels before transfer.
    const completed = await createImageBitmap(output, {
      imageOrientation: request.flipForTexture ? "flipY" : "none",
      premultiplyAlpha: "none",
    });
    self.postMessage({ bitmap: completed }, [completed]);
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    bitmap?.close();
    if (output) {
      output.width = 1;
      output.height = 1;
    }
  }
};
