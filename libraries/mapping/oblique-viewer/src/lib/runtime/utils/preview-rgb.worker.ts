/// <reference lib="webworker" />
import { resamplePreviewRgb } from "../../core/utils/resample-preview-rgb";
import {
  nativePreviewTiles,
  type NativePreviewWindow,
} from "../../core/utils/native-preview-window";
import type { DevicePixels } from "@carma-units";
import type { PreviewQualityLevel } from "../../core/constants";
import type {
  AvifPyramidPreviewSource,
  AvifPreviewPage,
} from "../integrations/avif-pyramid-preview-source";
import type { TiffPreviewSource } from "../integrations/tiff-preview-source";
import {
  OffscreenCanvasPool,
  type OffscreenCanvasLease,
} from "./offscreen-canvas-pool";

const compositionCanvases = new OffscreenCanvasPool({
  maxRetainedBytes: 8 * 1024 * 1024,
  maxRetainedCanvases: 2,
});
const decodeCanvases = new OffscreenCanvasPool({
  maxRetainedBytes: 4 * 1024 * 1024,
  maxRetainedCanvases: 1,
  contextOptions: { willReadFrequently: true },
});

let generation = 0;
let sourceUrl: string | null = null;
let decodedSource: Promise<ImageBitmap> | null = null;
let sourceBlob: Promise<Blob> | null = null;
let sourceAbort: AbortController | null = null;
let compositionAbort: AbortController | null = null;
let cachedCanvas: OffscreenCanvasLease | null = null;
let cachedWindowKey: string | null = null;
let cachedSourceSize: { width?: number; height?: number } = {};
let tiffSource: TiffPreviewSource | null = null;
let avifSource: AvifPyramidPreviewSource | null = null;
const unavailableAvifSources = new Map<string, number>();
let cachedRefined = false;
let cachedBackend: "avif-pyramid" | "tiff" | "jpeg" | undefined;
let sourceCacheWrite = Promise.resolve();
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
    avifPyramidUrl?: string;
    minimumQualityLevel?: PreviewQualityLevel;
    maxInitialDisplayPixelSize?: number;
    refineToNative?: boolean;
    priority?: "low" | "high" | "auto";
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
    avifSource?.park(request.retainedSourceByteLimit ?? 32 * 1024 * 1024);
    compositionCanvases.trim();
    decodeCanvases.trim();
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
  if (request.cancel) {
    sourceAbort?.abort();
    return;
  }
  let output: OffscreenCanvasLease | null = null;
  let bitmap: ImageBitmap | null = null;
  let published = false;
  try {
    const windowKey = JSON.stringify([
      request.url,
      request.avifPyramidUrl,
      request.window,
      request.nativeSize,
      request.maxInitialDisplayPixelSize ?? 8,
      request.refineToNative ?? true,
    ]);
    if (
      cachedCanvas &&
      cachedWindowKey === windowKey &&
      cachedRefined &&
      (!request.avifPyramidUrl ||
        cachedBackend === "avif-pyramid" ||
        (unavailableAvifSources.get(request.avifPyramidUrl) ?? 0) > Date.now())
    ) {
      const completed = await createImageBitmap(cachedCanvas.canvas, {
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
          sourceBackend: cachedBackend,
          complete: true,
        },
        [completed]
      );
      return;
    }
    let source: ImageBitmap | null = null;
    let pages: (
      | Awaited<ReturnType<TiffPreviewSource["select"]>>["image"]
      | AvifPreviewPage
      | string
    )[] = [];
    let usingAvif = false;
    const loadJpeg = async (url: string) => {
      // A retained sharper source also satisfies a new, coarser crop.
      if (
        decodedSource &&
        sourceUrl?.replace(/\/[0-6]\/(?!.*\/)/, "/") ===
          url.replace(/\/[0-6]\/(?!.*\/)/, "/")
      ) {
        const resident = await decodedSource.catch(() => null);
        controller.signal.throwIfAborted();
        const level = Number(
          new URL(url).pathname.match(/\/([0-6])\/[^/]+$/)?.[1] ?? 0
        );
        if (
          resident &&
          resident.width >= request.nativeSize.width / 2 ** level &&
          resident.height >= request.nativeSize.height / 2 ** level
        )
          return resident;
      }
      if (sourceUrl !== url) {
        sourceAbort?.abort();
        const download = new AbortController();
        sourceAbort = download;
        const previous = decodedSource;
        sourceUrl = url;
        decodedSource = null;
        sourceBlob = (async () => {
          const cache = await Promise.race([
            sourceCache,
            new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), 150)
            ),
          ]);
          const asset = url.replace(/\/[0-6]\/(?!.*\/)/, "/");
          const level = Number(
            new URL(url).pathname.match(/\/([0-6])\/[^/]+$/)?.[1] ?? 0
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
          const fetched = await fetch(url, {
            cache: "force-cache",
            signal: download.signal,
            priority: request.priority,
          });
          if (!fetched.ok) throw new Error("Preview image: " + fetched.status);
          const blob = await fetched.blob();
          if (sourceAbort === download) sourceAbort = null;
          // Persist the original encoded bytes: no lossy re-encode and no main-thread compression.
          if (cache)
            sourceCacheWrite = sourceCacheWrite
              .then(async () => {
                const keys = await cache.keys();
                if (
                  keys.some(
                    (key) =>
                      key.url.replace(/\/[0-6]\/(?!.*\/)/, "/") === asset &&
                      Number(
                        new URL(key.url).pathname.match(
                          /\/([0-6])\/[^/]+$/
                        )?.[1] ?? 0
                      ) < level
                  )
                )
                  return;
                for (const key of keys)
                  if (key.url.replace(/\/[0-6]\/(?!.*\/)/, "/") === asset)
                    await cache.delete(key);
                await cache.put(
                  url,
                  new Response(blob, { headers: fetched.headers })
                );
                const current = await cache.keys();
                for (const key of current.slice(
                  0,
                  Math.max(0, current.length - 4)
                ))
                  await cache.delete(key);
              })
              .catch(() => {});
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
      controller.signal.throwIfAborted();
      return source!;
    };
    if (
      request.avifPyramidUrl &&
      (unavailableAvifSources.get(request.avifPyramidUrl) ?? 0) <= Date.now()
    ) {
      try {
        if (avifSource?.url !== request.avifPyramidUrl) {
          avifSource?.close();
          const { AvifPyramidPreviewSource } = await import(
            "../integrations/avif-pyramid-preview-source"
          );
          controller.signal.throwIfAborted();
          avifSource = new AvifPyramidPreviewSource(
            request.avifPyramidUrl,
            request.retainedSourceByteLimit,
            request.priority
          );
        }
        const selected = await avifSource.select(
          request.window,
          request.nativeSize,
          controller.signal,
          request.maxInitialDisplayPixelSize ?? 8
        );
        // Validate native support with the requested ROI before choosing this backend.
        const probe = selected.image;
        const sx = probe.getWidth() / request.nativeSize.width,
          sy = probe.getHeight() / request.nativeSize.height;
        const x = Math.floor(request.window.source.x * sx),
          y = Math.floor(request.window.source.y * sy);
        await avifSource.read(
          probe,
          [
            x,
            y,
            Math.min(probe.getWidth(), x + 1),
            Math.min(probe.getHeight(), y + 1),
          ],
          controller.signal
        );
        pages =
          request.refineToNative === false
            ? [selected.image]
            : [selected.image, ...selected.refinements];
        usingAvif = true;
        unavailableAvifSources.delete(request.avifPyramidUrl);
      } catch (error) {
        controller.signal.throwIfAborted();
        avifSource?.close();
        avifSource = null;
        unavailableAvifSources.set(request.avifPyramidUrl, Date.now() + 30000);
        while (unavailableAvifSources.size > 16)
          unavailableAvifSources.delete(
            unavailableAvifSources.keys().next().value!
          );
      }
    }
    if (!usingAvif && request.tiff) {
      if (tiffSource?.url !== request.url) {
        const { TiffPreviewSource } = await import(
          "../integrations/tiff-preview-source"
        );
        controller.signal.throwIfAborted();
        tiffSource = new TiffPreviewSource(
          request.url,
          request.retainedSourceByteLimit,
          request.priority
        );
      }
      const selected = await tiffSource.select(
        request.window,
        request.nativeSize,
        controller.signal,
        request.maxInitialDisplayPixelSize ?? 8
      );
      pages =
        request.refineToNative === false
          ? [selected.image]
          : [selected.image, ...selected.refinements];
    } else if (!usingAvif) {
      const parsed = new URL(request.url);
      const levelMatch = /\/([0-6])\/[^/]+$/.test(parsed.pathname);
      const minimumLevel = Math.max(
        0,
        Math.min(6, Number(request.minimumQualityLevel ?? "0"))
      );
      const density = Math.max(
        request.window.target.width / request.window.source.width,
        request.window.target.height / request.window.source.height
      );
      const initialLevel = Math.max(
        minimumLevel,
        Math.min(
          6,
          Math.floor(
            Math.log2((request.maxInitialDisplayPixelSize ?? 8) / density)
          )
        )
      );
      pages = levelMatch
        ? Array.from(
            {
              length:
                request.refineToNative === false
                  ? 1
                  : initialLevel - minimumLevel + 1,
            },
            (_, step) => {
              const stageUrl = new URL(parsed);
              stageUrl.pathname = stageUrl.pathname.replace(
                /\/[0-6]\/(?=[^/]+$)/,
                `/${initialLevel - step}/`
              );
              return stageUrl.href;
            }
          )
        : [request.url];
    }
    let failure: unknown;
    for (const [stage, entry] of pages.entries()) {
      controller.signal.throwIfAborted();
      const page = typeof entry === "string" ? null : entry;
      if (typeof entry === "string") {
        try {
          source = await loadJpeg(entry);
        } catch (error) {
          controller.signal.throwIfAborted();
          failure = error;
          continue;
        }
      }
      const width = page?.getWidth() ?? source!.width;
      const height = page?.getHeight() ?? source!.height;
      // Refine the same bounded crop rather than allocating the native sensor extent.
      output ??= compositionCanvases.acquire(request.window.target);
      const target = output.context;
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
          pixelsIn = usingAvif
            ? await avifSource!.read(
                page as AvifPreviewPage,
                [x, y, right, bottom],
                controller.signal
              )
            : await tiffSource!.read(
                page as Awaited<
                  ReturnType<TiffPreviewSource["select"]>
                >["image"],
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
          const decode = decodeCanvases.acquire({
            width: bitmap.width as DevicePixels,
            height: bitmap.height as DevicePixels,
          });
          try {
            const context = decode.context;
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
            decode.release();
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
      const completed = await createImageBitmap(output.canvas, {
        imageOrientation: request.flipForTexture ? "flipY" : "none",
        premultiplyAlpha: "none",
      });
      if (epoch !== generation) {
        completed.close();
        return;
      }
      {
        if (cachedCanvas && cachedCanvas !== output) {
          cachedCanvas.release();
        }
        cachedCanvas = output;
        cachedWindowKey = windowKey;
        cachedSourceSize = { width, height };
        cachedBackend = usingAvif
          ? "avif-pyramid"
          : request.tiff
          ? "tiff"
          : "jpeg";
        cachedRefined = stage === pages.length - 1;
      }
      self.postMessage(
        {
          bitmap: completed,
          generation: request.generation,
          sourceWidth: width,
          sourceHeight: height,
          sourceBackend: usingAvif
            ? "avif-pyramid"
            : request.tiff
            ? "tiff"
            : "jpeg",
          complete:
            stage === pages.length - 1 ||
            (!request.tiff &&
              !usingAvif &&
              width >=
                request.nativeSize.width /
                  2 ** Number(request.minimumQualityLevel ?? "0") &&
              height >=
                request.nativeSize.height /
                  2 ** Number(request.minimumQualityLevel ?? "0")),
        },
        [completed]
      );
      published = true;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (
        !request.tiff &&
        !usingAvif &&
        width >=
          request.nativeSize.width /
            2 ** Number(request.minimumQualityLevel ?? "0") &&
        height >=
          request.nativeSize.height /
            2 ** Number(request.minimumQualityLevel ?? "0")
      ) {
        cachedRefined = true;
        break;
      }
    }
    if (!published && failure) throw failure;
  } catch (error) {
    if (epoch === generation && !published && !controller.signal.aborted)
      self.postMessage({
        generation: request.generation,
        error: error instanceof Error ? error.message : String(error),
      });
  } finally {
    bitmap?.close();
    if (output && output !== cachedCanvas) {
      output.release();
    }
  }
};
