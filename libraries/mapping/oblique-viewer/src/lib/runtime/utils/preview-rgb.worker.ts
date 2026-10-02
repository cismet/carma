/// <reference lib="webworker" />
import { resamplePreviewRgb } from "../../core/utils/resample-preview-rgb";
import {
  nativePreviewTiles,
  type NativePreviewWindow,
} from "../../core/utils/native-preview-window";
import type { DevicePixels } from "@carma-units";

let generation = 0;
let sourceUrl: string | null = null;
let decodedSource: Promise<ImageBitmap> | null = null;
let sourceBlob: Promise<Blob> | null = null;
let cachedCanvas: OffscreenCanvas | null = null;
let cachedWindowKey: string | null = null;
let cachedSourceSize: { width?: number; height?: number } = {};
const sourceCache =
  typeof caches === "undefined"
    ? Promise.resolve(null)
    : caches.open("carma-oblique-image-sources-v1").catch(() => null);

self.onmessage = async (
  event: MessageEvent<{
    url: string;
    window: NativePreviewWindow;
    nativeSize: { width: DevicePixels; height: DevicePixels };
    flipForTexture: boolean;
    wholeImage?: boolean;
    generation?: number;
    cancel?: boolean;
    park?: boolean;
    retainedSourceByteLimit?: number;
  }>
) => {
  const request = event.data;
  const epoch = ++generation;
  if (request.park) {
    const cached = decodedSource;
    void cached?.then(
      (value) => {
        if (
          decodedSource === cached &&
          value.width * value.height * 4 >
            (request.retainedSourceByteLimit ?? 64 * 1024 * 1024)
        ) {
          decodedSource = null;
          value.close();
        }
      },
      () => {}
    );
  }
  if (request.cancel) return;
  let output: OffscreenCanvas | null = null;
  let bitmap: ImageBitmap | null = null;
  try {
    const windowKey = JSON.stringify([
      request.url,
      request.window,
      request.nativeSize,
    ]);
    if (request.wholeImage && cachedCanvas && cachedWindowKey === windowKey) {
      const completed = await createImageBitmap(cachedCanvas, {
        imageOrientation: request.flipForTexture ? "flipY" : "none",
        premultiplyAlpha: "none",
      });
      if (epoch !== generation) {
        completed.close();
        return;
      }
      self.postMessage(
        {
          bitmap: completed,
          generation: request.generation,
          sourceWidth: cachedSourceSize.width,
          sourceHeight: cachedSourceSize.height,
        },
        [completed]
      );
      return;
    }
    let source: ImageBitmap | null = null;
    if (request.wholeImage) {
      if (sourceUrl !== request.url) {
        const previous = decodedSource;
        sourceUrl = request.url;
        decodedSource = null;
        sourceBlob = (async () => {
          const cache = await Promise.race([
            sourceCache,
            new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), 150)
            ),
          ]);
          const asset = request.url.replace(/\/[0-6]\/(?!.*\/)/, "/");
          const level = Number(
            new URL(request.url).pathname.match(/\/([0-6])\/[^/]+$/)?.[1] ?? 0
          );
          let response: Response | undefined;
          try {
            const keys = await cache?.keys();
            const cached = keys?.find(
              (key) =>
                key.url.replace(/\/[0-6]\/(?!.*\/)/, "/") === asset &&
                Number(
                  new URL(key.url).pathname.match(/\/([0-6])\/[^/]+$/)?.[1] ?? 0
                ) <= level
            );
            if (cached) response = await cache?.match(cached);
          } catch {
            /* Optional local cache cannot prevent a network preview. */
          }
          if (response) return response.blob();
          const fetched = await fetch(request.url, { cache: "force-cache" });
          if (!fetched.ok) throw new Error("Preview image: " + fetched.status);
          const blob = await fetched.blob();
          // Persist the original encoded bytes: no lossy re-encode and no main-thread compression.
          if (cache)
            void (async () => {
              const keys = await cache.keys();
              for (const key of keys)
                if (key.url.replace(/\/[0-6]\/(?!.*\/)/, "/") === asset)
                  await cache.delete(key);
              await cache.put(
                request.url,
                new Response(blob, { headers: fetched.headers })
              );
              const current = await cache.keys();
              for (const key of current.slice(
                0,
                Math.max(0, current.length - 4)
              ))
                await cache.delete(key);
            })().catch(() => {});
          return blob;
        })();
        void previous?.then(
          (value) => value.close(),
          () => {}
        );
      }
      decodedSource ??= sourceBlob!.then((blob) =>
        createImageBitmap(blob, { premultiplyAlpha: "none" })
      );
      try {
        source = await decodedSource;
      } catch (error) {
        if (sourceUrl === request.url) {
          decodedSource = null;
          sourceUrl = null;
        }
        throw error;
      }
      if (epoch !== generation) return;
    }
    output = new OffscreenCanvas(
      request.window.target.width,
      request.window.target.height
    );
    const target = output.getContext("2d");
    if (!target) throw new Error("No RGB composition canvas");
    for (const tile of nativePreviewTiles(request.window, request.nativeSize)) {
      if (epoch !== generation) return;
      const url = new URL(request.url);
      Object.entries({ ...tile.source, edge: tile.edge }).forEach(
        ([name, value]) => url.searchParams.set(name, String(value))
      );
      if (source) {
        const scaleX = source.width / request.nativeSize.width;
        const scaleY = source.height / request.nativeSize.height;
        const x = Math.floor(tile.source.x * scaleX);
        const y = Math.floor(tile.source.y * scaleY);
        const right = Math.min(
          source.width,
          Math.ceil((tile.source.x + tile.source.width) * scaleX)
        );
        const bottom = Math.min(
          source.height,
          Math.ceil((tile.source.y + tile.source.height) * scaleY)
        );
        bitmap = await createImageBitmap(source, x, y, right - x, bottom - y);
      } else {
        const response = await fetch(url);
        if (!response.ok)
          throw new Error("Native RGB preview: " + response.status);
        bitmap = await createImageBitmap(await response.blob());
      }
      if (epoch !== generation) return;
      const decode = new OffscreenCanvas(bitmap.width, bitmap.height);
      try {
        const context = decode.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("No RGB decode canvas");
        context.drawImage(bitmap, 0, 0);
        const input = context.getImageData(0, 0, bitmap.width, bitmap.height);
        const scaleX = source
          ? source.width / request.nativeSize.width
          : bitmap.width / tile.source.width;
        const scaleY = source
          ? source.height / request.nativeSize.height
          : bitmap.height / tile.source.height;
        const originX = source
          ? Math.floor(tile.source.x * scaleX) / scaleX
          : tile.source.x;
        const originY = source
          ? Math.floor(tile.source.y * scaleY) / scaleY
          : tile.source.y;
        const pixels = resamplePreviewRgb(
          input.data,
          bitmap.width as DevicePixels,
          bitmap.height as DevicePixels,
          tile.target.width,
          tile.target.height,
          {
            x: ((tile.sample.x - originX) * scaleX) as DevicePixels,
            y: ((tile.sample.y - originY) * scaleY) as DevicePixels,
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
      // Accept cancellation between bounded tiles; never compose on the UI thread.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (epoch !== generation) return;
    // ImageBitmap WebGL uploads ignore Texture.flipY; orient the pixels before transfer.
    const completed = await createImageBitmap(output, {
      imageOrientation: request.flipForTexture ? "flipY" : "none",
      premultiplyAlpha: "none",
    });
    if (epoch !== generation) {
      completed.close();
      return;
    }
    if (request.wholeImage) {
      if (cachedCanvas && cachedCanvas !== output) {
        cachedCanvas.width = 1;
        cachedCanvas.height = 1;
      }
      cachedCanvas = output;
      cachedWindowKey = windowKey;
      cachedSourceSize = { width: source?.width, height: source?.height };
    }
    self.postMessage(
      {
        bitmap: completed,
        generation: request.generation,
        sourceWidth: source?.width,
        sourceHeight: source?.height,
      },
      [completed]
    );
  } catch (error) {
    if (epoch === generation)
      self.postMessage({
        generation: request.generation,
        error: error instanceof Error ? error.message : String(error),
      });
  } finally {
    bitmap?.close();
    if (output && output !== cachedCanvas) {
      output.width = 1;
      output.height = 1;
    }
  }
};
