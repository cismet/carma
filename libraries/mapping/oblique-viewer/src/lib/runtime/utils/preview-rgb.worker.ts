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
let cachedFrame: NativePreviewWindow | null = null;
let cachedPhotoKey: string | null = null;
let cachedDensity = 0;
let cachedSourceSize: { width?: number; height?: number } = {};
let tiffSource: TiffPreviewSource | null = null;
let containsTiffDecoder = false;
let avifSource: AvifPyramidPreviewSource | null = null;
const unavailableAvifSources = new Map<string, number>();
const unavailableAvifErrors = new Map<string, unknown>();
let cachedRefined = false;
let cachedNativeRefinement = false;
let cachedBackend: "avif-pyramid" | "tiff" | "jpeg" | undefined;
let sourceCacheWrite = Promise.resolve();
const sourceCache =
  typeof caches === "undefined"
    ? Promise.resolve(null)
    : caches.open("carma-oblique-image-sources-v1").catch(() => null);

type PreviewRgbRequest = {
  url: string;
  window: NativePreviewWindow;
  nativeSize: { width: DevicePixels; height: DevicePixels };
  flipForTexture: boolean;
  tiff?: boolean;
  avifPyramidUrl?: string;
  avifOnly?: boolean;
  minimumQualityLevel?: PreviewQualityLevel;
  maxInitialDisplayPixelSize?: number;
  refineToNative?: boolean;
  priority?: "low" | "high" | "auto";
  generation?: number;
  cancel?: boolean;
  park?: boolean;
  retainedSourceByteLimit?: number;
  imageId?: string;
  sourceIdentity?: string;
  activeSourceByteLimit?: number;
  retainWholeImage?: boolean;
  reusePublished?: boolean;
};
type PhotoSession = {
  key: string;
  request: PreviewRgbRequest;
  controller: AbortController;
  started: boolean;
};
let photoSession: PhotoSession | null = null;
const foregroundCompositions = new Set<number>();
const backgroundCanvasPool = new OffscreenCanvasPool({
  maxRetainedBytes: 8 * 1024 * 1024,
  maxRetainedCanvases: 1,
});
const photoIdentity = (request: PreviewRgbRequest) =>
  JSON.stringify([
    request.sourceIdentity ??
      request.avifPyramidUrl ??
      request.url.replace(/\/[0-6]\/(?=[^/]+$)/, "/"),
    request.nativeSize,
    request.imageId,
    request.flipForTexture,
  ]);
const delayBackground = () =>
  new Promise<void>((resolve) => setTimeout(resolve, 4));
const reportSourceMemory = (
  session: PhotoSession,
  source: AvifPyramidPreviewSource,
  complete = false
) => {
  if (photoSession !== session || session.controller.signal.aborted) return;
  const request = session.request;
  self.postMessage({
    kind: "source-memory",
    imageId: request.imageId,
    sourceIdentity:
      request.sourceIdentity ?? request.avifPyramidUrl ?? request.url,
    sourceUrl: request.url,
    sourceResidentBytes: source.residentBytes,
    allLevelsDecoded: complete,
  });
};
const warmCurrentPhoto = (
  session: PhotoSession,
  source: AvifPyramidPreviewSource
) => {
  if (session.started || !session.request.retainWholeImage) return;
  session.started = true;
  void (async () => {
    const signal = session.controller.signal;
    while (foregroundCompositions.size) {
      signal.throwIfAborted();
      await delayBackground();
    }
    const request = session.request;
    const width = request.nativeSize.width,
      height = request.nativeSize.height;
    const scale = Math.min(1, 1024 / Math.max(width, height));
    const fullWindow: NativePreviewWindow = {
      source: { x: 0 as DevicePixels, y: 0 as DevicePixels, width, height },
      target: {
        width: Math.max(1, Math.round(width * scale)) as DevicePixels,
        height: Math.max(1, Math.round(height * scale)) as DevicePixels,
      },
    };
    const { image } = await source.select(
      fullWindow,
      request.nativeSize,
      signal,
      1
    );
    const pixels = await source.read(
      image,
      [0, 0, image.getWidth(), image.getHeight()],
      signal
    );
    const lease = backgroundCanvasPool.acquire({
      width: image.getWidth() as DevicePixels,
      height: image.getHeight() as DevicePixels,
    });
    let bitmap: ImageBitmap | null = null;
    try {
      lease.context.putImageData(
        new ImageData(pixels, image.getWidth(), image.getHeight()),
        0,
        0
      );
      bitmap = await createImageBitmap(lease.canvas, {
        imageOrientation: request.flipForTexture ? "flipY" : "none",
        premultiplyAlpha: "none",
      });
      signal.throwIfAborted();
      if (photoSession !== session) return;
      self.postMessage(
        {
          kind: "full-image",
          bitmap,
          imageId: request.imageId,
          sourceIdentity:
            request.sourceIdentity ?? request.avifPyramidUrl ?? request.url,
          sourceUrl: request.url,
          crop: fullWindow.source,
          sourceWidth: image.getWidth(),
          sourceHeight: image.getHeight(),
          sampleDensity: image.getWidth() / width,
          sourceBackend: "avif-pyramid",
          sourceResidentBytes: source.residentBytes,
        },
        [bitmap]
      );
      bitmap = null;
    } finally {
      bitmap?.close();
      lease.release();
    }
    let reportedAt = 0;
    await source.warmAllLevels(request.nativeSize, signal, {
      shouldYield: () => foregroundCompositions.size > 0,
      onProgress: () => {
        if (performance.now() - reportedAt >= 200) {
          reportedAt = performance.now();
          reportSourceMemory(session, source);
        }
      },
    });
    reportSourceMemory(session, source, source.isFullyDecoded);
  })().catch(() => {
    // Visible pixels survive background/asset-replacement failure. A later foreground request can restart warming.
    if (photoSession === session && !session.controller.signal.aborted)
      session.started = false;
  });
};

const retainCurrentJpeg = (session: PhotoSession, source: ImageBitmap) => {
  if (session.started || !session.request.retainWholeImage) return;
  session.started = true;
  void (async () => {
    const request = session.request,
      signal = session.controller.signal;
    const scale = Math.min(1, 1024 / Math.max(source.width, source.height));
    const bitmap = await createImageBitmap(source, {
      resizeWidth: Math.max(1, Math.round(source.width * scale)),
      resizeHeight: Math.max(1, Math.round(source.height * scale)),
      resizeQuality: "high",
      imageOrientation: request.flipForTexture ? "flipY" : "none",
      premultiplyAlpha: "none",
    });
    if (signal.aborted || photoSession !== session) {
      bitmap.close();
      return;
    }
    self.postMessage(
      {
        kind: "full-image",
        bitmap,
        imageId: request.imageId,
        sourceIdentity: request.sourceIdentity ?? request.url,
        sourceUrl: request.url,
        crop: { x: 0, y: 0, ...request.nativeSize },
        sourceWidth: source.width,
        sourceHeight: source.height,
        sourceBackend: "jpeg",
        sourceResidentBytes: source.width * source.height * 4,
      },
      [bitmap]
    );
  })().catch(() => {
    if (photoSession === session && !session.controller.signal.aborted)
      session.started = false;
  });
};

self.onmessage = async (event: MessageEvent<PreviewRgbRequest>) => {
  const request = event.data;
  if (request.park) {
    photoSession?.controller.abort();
    photoSession = null;
  }
  if (!request.cancel && !request.park) {
    const key = photoIdentity(request);
    if (photoSession?.key !== key) {
      photoSession?.controller.abort();
      photoSession = {
        key,
        request,
        controller: new AbortController(),
        started: false,
      };
    } else photoSession.request = request;
  }
  const currentPhoto = photoSession;
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
    // The completed ROI is retained; full JPEG decode/blob storage is released on park.
    const cached = decodedSource;
    decodedSource = null;
    sourceBlob = null;
    sourceUrl = null;
    void cached?.then(
      (value) => value.close(),
      () => {}
    );
  }
  if (request.cancel) {
    sourceAbort?.abort();
    return;
  }
  foregroundCompositions.add(epoch);
  let output: OffscreenCanvasLease | null = null;
  let bitmap: ImageBitmap | null = null;
  let published = false;
  try {
    if (request.avifOnly && !request.avifPyramidUrl)
      throw Error("AVIF-only preview requires a published pyramid URL");
    if (
      request.avifOnly &&
      (unavailableAvifSources.get(request.avifPyramidUrl!) ?? 0) > Date.now()
    )
      throw (
        unavailableAvifErrors.get(request.avifPyramidUrl!) ??
        Error("AVIF pyramid is not yet available")
      );
    const windowKey = JSON.stringify([
      request.url,
      request.avifPyramidUrl,
      request.window,
      request.nativeSize,
      request.maxInitialDisplayPixelSize ?? 8,
      request.refineToNative ?? true,
    ]);
    const photoKey = JSON.stringify([
      request.avifPyramidUrl ??
        (request.tiff
          ? request.url
          : request.url.replace(/\/[0-6]\/(?=[^/]+$)/, "/")),
      request.nativeSize,
    ]);
    const nearFrame =
      cachedCanvas &&
      cachedFrame &&
      Math.abs(cachedCanvas.canvas.width - request.window.target.width) <= 1 &&
      Math.abs(cachedCanvas.canvas.height - request.window.target.height) <=
        1 &&
      [
        Math.abs(cachedFrame.source.x - request.window.source.x),
        Math.abs(
          cachedFrame.source.x +
            cachedFrame.source.width -
            request.window.source.x -
            request.window.source.width
        ),
      ].every(
        (d) =>
          (d * cachedCanvas!.canvas.width) / cachedFrame!.source.width <= 0.5
      ) &&
      [
        Math.abs(cachedFrame.source.y - request.window.source.y),
        Math.abs(
          cachedFrame.source.y +
            cachedFrame.source.height -
            request.window.source.y -
            request.window.source.height
        ),
      ].every(
        (d) =>
          (d * cachedCanvas!.canvas.height) / cachedFrame!.source.height <= 0.5
      );
    const coveredFrame =
      cachedCanvas &&
      cachedFrame &&
      cachedFrame.source.x <= request.window.source.x &&
      cachedFrame.source.y <= request.window.source.y &&
      cachedFrame.source.x + cachedFrame.source.width >=
        request.window.source.x + request.window.source.width &&
      cachedFrame.source.y + cachedFrame.source.height >=
        request.window.source.y + request.window.source.height;
    const neededDensity = Math.min(
      request.window.target.width / request.window.source.width,
      request.window.target.height / request.window.source.height,
      cachedBackend === "avif-pyramid"
        ? 0.5
        : cachedBackend === "tiff"
        ? 1
        : 2 ** -Number(request.minimumQualityLevel ?? "0")
    );
    if (
      cachedCanvas &&
      cachedPhotoKey === photoKey &&
      (cachedWindowKey === windowKey ||
        nearFrame ||
        (coveredFrame && cachedDensity >= neededDensity)) &&
      cachedRefined &&
      (!request.avifOnly || cachedBackend === "avif-pyramid") &&
      (cachedNativeRefinement || request.refineToNative === false) &&
      (!request.avifPyramidUrl ||
        cachedBackend === "avif-pyramid" ||
        (unavailableAvifSources.get(request.avifPyramidUrl) ?? 0) > Date.now())
    ) {
      if (request.reusePublished) {
        self.postMessage({
          generation: request.generation,
          reusePublished: true,
          sourceResidentBytes:
            cachedBackend === "jpeg"
              ? (cachedSourceSize.width ?? 0) *
                (cachedSourceSize.height ?? 0) *
                4
              : avifSource?.residentBytes ?? 0,
        });
        if (currentPhoto && avifSource && cachedBackend === "avif-pyramid")
          warmCurrentPhoto(currentPhoto, avifSource);
        return;
      }
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
          crop: cachedFrame?.source,
          sampleDensity: cachedDensity,
          containsTiffDecoder,
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
            request.retainWholeImage
              ? request.activeSourceByteLimit ?? 768 * 1024 * 1024
              : request.retainedSourceByteLimit,
            request.priority
          );
        }
        if (request.retainWholeImage)
          avifSource.setActiveCacheBudget(
            request.activeSourceByteLimit ?? 768 * 1024 * 1024
          );
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
        const probeBounds: [number, number, number, number] = [
          x,
          y,
          Math.min(probe.getWidth(), x + 1),
          Math.min(probe.getHeight(), y + 1),
        ];
        if (!avifSource.hasCached(probe, probeBounds))
          await avifSource.read(probe, probeBounds, controller.signal);
        pages =
          request.refineToNative === false
            ? [selected.image]
            : [selected.image, ...selected.refinements];
        usingAvif = true;
        unavailableAvifSources.delete(request.avifPyramidUrl);
        unavailableAvifErrors.delete(request.avifPyramidUrl);
      } catch (error) {
        controller.signal.throwIfAborted();
        avifSource?.close();
        avifSource = null;
        unavailableAvifErrors.set(request.avifPyramidUrl, error);
        unavailableAvifSources.set(request.avifPyramidUrl, Date.now() + 15000);
        while (unavailableAvifSources.size > 16) {
          const oldest = unavailableAvifSources.keys().next().value!;
          unavailableAvifSources.delete(oldest);
          unavailableAvifErrors.delete(oldest);
        }
      }
    }
    if (request.avifOnly && !usingAvif)
      throw (
        unavailableAvifErrors.get(request.avifPyramidUrl!) ??
        Error("AVIF pyramid is unavailable or unsupported")
      );
    if (!usingAvif && request.tiff) {
      if (tiffSource?.url !== request.url) {
        const { TiffPreviewSource } = await import(
          "../integrations/tiff-preview-source"
        );
        controller.signal.throwIfAborted();
        containsTiffDecoder = true;
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
    const tiles = nativePreviewTiles(request.window, request.nativeSize);
    if (usingAvif && avifSource) {
      // Admit the sharpest resident ROI immediately; do not replay blurry cached stages.
      for (let stage = pages.length - 1; stage > 0; stage--) {
        const page = pages[stage] as AvifPreviewPage;
        const sx = page.getWidth() / request.nativeSize.width;
        const sy = page.getHeight() / request.nativeSize.height;
        if (
          tiles.every(({ source }) =>
            avifSource!.hasCached(page, [
              Math.floor(source.x * sx),
              Math.floor(source.y * sy),
              Math.min(
                page.getWidth(),
                Math.ceil((source.x + source.width) * sx)
              ),
              Math.min(
                page.getHeight(),
                Math.ceil((source.y + source.height) * sy)
              ),
            ])
          )
        ) {
          pages = pages.slice(stage);
          break;
        }
      }
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
      const density = Math.min(
        width / request.nativeSize.width,
        height / request.nativeSize.height,
        request.window.target.width / request.window.source.width,
        request.window.target.height / request.window.source.height
      );
      const covers =
        cachedPhotoKey === photoKey &&
        cachedFrame &&
        cachedFrame.source.x <= request.window.source.x &&
        cachedFrame.source.y <= request.window.source.y &&
        cachedFrame.source.x + cachedFrame.source.width >=
          request.window.source.x + request.window.source.width &&
        cachedFrame.source.y + cachedFrame.source.height >=
          request.window.source.y + request.window.source.height;
      if (cachedRefined && covers && density < cachedDensity) continue;
      // Refine the same bounded crop rather than allocating the native sensor extent.
      output ??= compositionCanvases.acquire(request.window.target);
      const target = output.context;
      for (const tile of tiles) {
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
        cachedFrame = request.window;
        cachedPhotoKey = photoKey;
        cachedDensity = density;
        cachedSourceSize = { width, height };
        cachedBackend = usingAvif
          ? "avif-pyramid"
          : request.tiff
          ? "tiff"
          : "jpeg";
        cachedRefined = stage === pages.length - 1;
        cachedNativeRefinement = request.refineToNative !== false;
      }
      self.postMessage(
        {
          bitmap: completed,
          generation: request.generation,
          sourceWidth: width,
          sourceHeight: height,
          crop: request.window.source,
          sampleDensity: density,
          containsTiffDecoder,
          sourceResidentBytes: usingAvif
            ? avifSource!.residentBytes
            : source
            ? source.width * source.height * 4
            : 0,
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
    if (
      published &&
      usingAvif &&
      avifSource &&
      currentPhoto &&
      request.retainWholeImage
    )
      warmCurrentPhoto(currentPhoto, avifSource);
    else if (published && !request.tiff && !usingAvif && source && currentPhoto)
      retainCurrentJpeg(currentPhoto, source);
  } catch (error) {
    if (epoch === generation && !published && !controller.signal.aborted)
      self.postMessage({
        generation: request.generation,
        error: error instanceof Error ? error.message : String(error),
        missing:
          (error instanceof TypeError &&
            /^(?:Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?)$/i.test(
              error.message
            )) ||
          /(?:refusing (?:404|410) full-file response|metadata unavailable \((?:404|410)\)|(?:Thumbnail preview|Preview image):\s*(?:404|410))/.test(
            error instanceof Error ? error.message : String(error)
          ),
      });
  } finally {
    foregroundCompositions.delete(epoch);
    bitmap?.close();
    if (output && output !== cachedCanvas) {
      output.release();
    }
  }
};
