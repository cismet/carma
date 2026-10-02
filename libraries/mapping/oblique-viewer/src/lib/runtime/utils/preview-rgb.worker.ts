/// <reference lib="webworker" />
import { resamplePreviewRgb } from "../../core/utils/resample-preview-rgb";
import {
  nativePreviewTiles,
  type NativePreviewWindow,
} from "../../core/utils/native-preview-window";
import type { DevicePixels } from "@carma-units";
import type { TiffPreviewSource } from "../integrations/tiff-preview-source";

let generation = 0;
let sourceUrl: string | null = null;
let decodedSource: Promise<ImageBitmap> | null = null;
let sourceBlob: Promise<Blob> | null = null;
let sourceAbort: AbortController | null = null;
let compositionAbort: AbortController | null = null;
let cachedCanvas: OffscreenCanvas | null = null;
let cachedWindowKey: string | null = null;
let cachedSourceSize: { width?: number; height?: number } = {};
let tiffSource: TiffPreviewSource | null = null;
let cachedRefined = false;
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
    tiff?: boolean;
    generation?: number;
    cancel?: boolean;
    park?: boolean;
    retainedSourceByteLimit?: number;
  }>
) => {
  const request = event.data;
  const epoch = ++generation;
  compositionAbort?.abort();
  const controller = new AbortController();
  compositionAbort = controller;
  if (request.park) {
    if (sourceAbort) {
      sourceAbort.abort();
      sourceAbort = null;
      const pending = decodedSource;
      decodedSource = null;
      sourceBlob = null;
      sourceUrl = null;
      void pending?.then(
        (value) => value.close(),
        () => {}
      );
    }
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
  let published = false;
  try {
    const windowKey = JSON.stringify([
      request.url,
      request.window,
      request.nativeSize,
    ]);
    if (
      cachedCanvas &&
      cachedWindowKey === windowKey &&
      (!request.tiff || cachedRefined)
    ) {
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
    let pages: (
      | Awaited<ReturnType<TiffPreviewSource["select"]>>["image"]
      | null
    )[] = [null];
    if (request.tiff) {
      if (tiffSource?.url !== request.url) {
        const { TiffPreviewSource } = await import(
          "../integrations/tiff-preview-source"
        );
        controller.signal.throwIfAborted();
        tiffSource = new TiffPreviewSource(
          request.url,
          request.retainedSourceByteLimit
        );
      }
      const selected = await tiffSource.select(
        request.window,
        request.nativeSize,
        controller.signal
      );
      pages = selected.finer
        ? [selected.image, selected.finer]
        : [selected.image];
    } else {
      if (sourceUrl !== request.url) {
        sourceAbort?.abort();
        const download = new AbortController();
        sourceAbort = download;
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
            response = await Promise.race([
              (async () => {
                const keys = await cache?.keys();
                const cached = keys?.find(
                  (key) =>
                    key.url.replace(/\/[0-6]\/(?!.*\/)/, "/") === asset &&
                    Number(
                      new URL(key.url).pathname.match(
                        /\/([0-6])\/[^/]+$/
                      )?.[1] ?? 0
                    ) <= level
                );
                return cached ? cache?.match(cached) : undefined;
              })(),
              new Promise<undefined>((resolve) => setTimeout(resolve, 150)),
            ]);
          } catch {
            /* Optional local cache cannot prevent a network preview. */
          }
          download.signal.throwIfAborted();
          if (response) {
            const blob = await response.blob();
            download.signal.throwIfAborted();
            if (sourceAbort === download) sourceAbort = null;
            return blob;
          }
          download.signal.throwIfAborted();
          const fetched = await fetch(request.url, {
            cache: "force-cache",
            signal: download.signal,
          });
          if (!fetched.ok) throw new Error("Preview image: " + fetched.status);
          const blob = await fetched.blob();
          if (sourceAbort === download) sourceAbort = null;
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
      const pendingBlob = sourceBlob;
      decodedSource ??= pendingBlob!.then((blob) =>
        createImageBitmap(blob, { premultiplyAlpha: "none" })
      );
      try {
        source = await decodedSource;
      } catch (error) {
        if (sourceBlob === pendingBlob) {
          decodedSource = null;
          sourceBlob = null;
          sourceUrl = null;
          sourceAbort = null;
        }
        throw error;
      }
      if (epoch !== generation) return;
    }
    for (const [stage, page] of pages.entries()) {
      controller.signal.throwIfAborted();
      const width = page?.getWidth() ?? source!.width;
      const height = page?.getHeight() ?? source!.height;
      output = new OffscreenCanvas(
        request.window.target.width,
        request.window.target.height
      );
      const target = output.getContext("2d");
      if (!target) throw new Error("No RGB composition canvas");
      for (const tile of nativePreviewTiles(
        request.window,
        request.nativeSize
      )) {
        if (epoch !== generation) return;
        const scaleX = width / request.nativeSize.width;
        const scaleY = height / request.nativeSize.height;
        const x = Math.floor(tile.source.x * scaleX);
        const y = Math.floor(tile.source.y * scaleY);
        const right = Math.min(
          width,
          Math.ceil((tile.source.x + tile.source.width) * scaleX)
        );
        const bottom = Math.min(
          height,
          Math.ceil((tile.source.y + tile.source.height) * scaleY)
        );
        let pixelsIn: Uint8ClampedArray;
        if (page) {
          pixelsIn = await tiffSource!.read(
            page,
            [x, y, right, bottom],
            controller.signal
          );
        } else {
          bitmap = await createImageBitmap(
            source!,
            x,
            y,
            right - x,
            bottom - y
          );
          const decode = new OffscreenCanvas(bitmap.width, bitmap.height);
          try {
            const context = decode.getContext("2d", {
              willReadFrequently: true,
            });
            if (!context) throw new Error("No RGB decode canvas");
            context.drawImage(bitmap, 0, 0);
            pixelsIn = context.getImageData(
              0,
              0,
              bitmap.width,
              bitmap.height
            ).data;
          } finally {
            bitmap.close();
            bitmap = null;
            decode.width = 1;
            decode.height = 1;
          }
        }
        if (epoch !== generation) return;
        {
          const originX = Math.floor(tile.source.x * scaleX) / scaleX;
          const originY = Math.floor(tile.source.y * scaleY) / scaleY;
          const pixels = resamplePreviewRgb(
            pixelsIn,
            (right - x) as DevicePixels,
            (bottom - y) as DevicePixels,
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
      {
        if (cachedCanvas && cachedCanvas !== output) {
          cachedCanvas.width = 1;
          cachedCanvas.height = 1;
        }
        cachedCanvas = output;
        cachedWindowKey = windowKey;
        cachedSourceSize = { width, height };
        cachedRefined = stage === pages.length - 1;
      }
      self.postMessage(
        {
          bitmap: completed,
          generation: request.generation,
          sourceWidth: width,
          sourceHeight: height,
        },
        [completed]
      );
      published = true;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  } catch (error) {
    if (epoch === generation && !published && !controller.signal.aborted)
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
