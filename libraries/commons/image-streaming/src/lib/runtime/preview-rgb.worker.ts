/// <reference lib="webworker" />
import { readJpegImageSize } from "./jpeg-image-size";
import { composeImageViewport } from "./compose-image-viewport";
import {
  forecastPreviewWindow,
  type NativePreviewWindow,
} from "../core/image-viewport-window";
import type { DevicePixels } from "@carma-units";
import type { JpegPyramidLevel } from "../core/image-viewport-window";
import type {
  AvifPyramidPreviewSource,
  AvifPreviewPage,
} from "./avif-pyramid-preview-source";
import type { TiffPreviewSource } from "./tiff-preview-source";
import {
  OffscreenCanvasPool,
  type OffscreenCanvasLease,
} from "./offscreen-canvas-pool";

const compositionCanvases = new OffscreenCanvasPool({
  maxRetainedBytes: 0,
  maxRetainedCanvases: 0,
});
const decodeCanvases = new OffscreenCanvasPool({
  maxRetainedBytes: 0,
  maxRetainedCanvases: 0,
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
let cachedSourceLevel: number | undefined;
let tiffSource: TiffPreviewSource | null = null;
let containsTiffDecoder = false;
let avifSource: AvifPyramidPreviewSource | null = null;
const unavailableAvifSources = new Map<string, number>();
const unavailableAvifErrors = new Map<string, unknown>();
let cachedRefined = false;
let cachedNativeRefinement = false;
let cachedBackend: "avif-pyramid" | "tiff" | "jpeg" | undefined;
const workingAllocations = new Map<number, number>();
let peakWorkingBytes = 0;
const recordWorkingAllocation = (epoch: number, bytes: number) => {
  workingAllocations.set(epoch, bytes);
  peakWorkingBytes = Math.max(
    peakWorkingBytes,
    [...workingAllocations.values()].reduce((sum, value) => sum + value, 0)
  );
};
const assertPreviewExtent = (
  surface: { width: number; height: number },
  expected: NativePreviewWindow["target"],
  kind: "canvas" | "bitmap"
) => {
  if (surface.width !== expected.width || surface.height !== expected.height)
    throw new Error(`Preview ${kind} extent ${surface.width}x${surface.height} differs from target ${expected.width}x${expected.height}`);
};

const workerMemory = () => {
  const composition = compositionCanvases.stats,
    decode = decodeCanvases.stats;
  return {
    compositionBytes: composition.activeBytes + composition.retainedBytes,
    decodeCanvasBytes: decode.activeBytes + decode.retainedBytes,
    workingBytes: [...workingAllocations.values()].reduce(
      (sum, bytes) => sum + bytes,
      0
    ),
    peakWorkingBytes,
  };
};
let jpegOverview: ImageBitmap | null = null;
let jpegOverviewDensity = 0;
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
  minimumQualityLevel?: JpegPyramidLevel;
  maxInitialDisplayPixelSize?: number;
  maxSourceDensity?: number;
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
  /** Host owns the published pixels; avoid a duplicate worker canvas. */
  releaseCanvasAfterPublish?: boolean;
  activity?: boolean;
  warmWindow?: NativePreviewWindow;
  budgetOnly?: false;
};
type BudgetOnlyRequest = {
  budgetOnly: true;
  activeSourceByteLimit?: number;
  window?: NativePreviewWindow;
};
type PhotoSession = {
  key: string;
  request: PreviewRgbRequest;
  /** Idle motion must not mutate the geometry of an in-flight foreground request. */
  warmWindow: NativePreviewWindow;
  controller: AbortController;
  started: boolean;
  idleTimer?: ReturnType<typeof setTimeout>;
  warmedViewportKey?: string;
  overviewPublished?: boolean;
  lastForegroundWindow?: NativePreviewWindow;
  zoomFactor?: number;
  zoomAnchor?: { x: DevicePixels; y: DevicePixels };
  panDelta?: { x: number; y: number };
  jpegFetched?: Set<number>;
  jpegStored?: Set<number>;
  jpegPending?: number;
};
let photoSession: PhotoSession | null = null;
let interactionActive = false;
const foregroundCompositions = new Set<number>();
const compositionTileEdge = 512;
type AvifCacheRequest = Pick<
  PreviewRgbRequest,
  "activeSourceByteLimit" | "retainedSourceByteLimit"
>;
const avifCacheBudget = (request: AvifCacheRequest) =>
  Math.max(0, request.activeSourceByteLimit ?? request.retainedSourceByteLimit ?? 0);
const pageViewportBounds = (
  page: AvifPreviewPage,
  window: NativePreviewWindow,
  nativeSize: PreviewRgbRequest["nativeSize"]
): [number, number, number, number] => {
  const sx = page.getWidth() / nativeSize.width;
  const sy = page.getHeight() / nativeSize.height;
  return [
    Math.max(0, Math.floor(window.source.x * sx) - 1),
    Math.max(0, Math.floor(window.source.y * sy) - 1),
    Math.min(page.getWidth(), Math.ceil((window.source.x + window.source.width) * sx) + 1),
    Math.min(page.getHeight(), Math.ceil((window.source.y + window.source.height) * sy) + 1),
  ];
};
const sourcePageLocallyAvailable = (
  source: AvifPyramidPreviewSource,
  page: AvifPreviewPage,
  request: PreviewRgbRequest
) => source.hasLocallyAvailable(page, pageViewportBounds(page, request.window, request.nativeSize));
const photoIdentity = (request: PreviewRgbRequest) =>
  JSON.stringify([
    request.sourceIdentity ??
      request.avifPyramidUrl ??
      request.url.replace(/\/[0-6]\/(?=[^/]+$)/, "/"),
    request.nativeSize,
    request.imageId,
    request.flipForTexture,
  ]);
const effectiveWarmRequest = (session: PhotoSession): PreviewRgbRequest => ({
  ...session.request,
  window: session.warmWindow,
});
const reportSourceMemory = (
  session: PhotoSession,
  source: AvifPyramidPreviewSource,
  signal = session.controller.signal
) => {
  if (photoSession !== session || signal.aborted) return;
  const request = session.request;
  self.postMessage({
    kind: "source-memory",
    imageId: request.imageId,
    sourceIdentity:
      request.sourceIdentity ?? request.avifPyramidUrl ?? request.url,
    sourceUrl: request.url,
    sourceResidentBytes: source.residentBytes,
    sourceMemory: source.memoryMetrics,
    neighborhoodReadiness: source.neighborhoodReadiness,
    readiness: source.levelReadiness,
    workerMemory: workerMemory(),
  });
};
const cancelPhotoPrewarm = (session: PhotoSession) => {
  if (session.idleTimer !== undefined) clearTimeout(session.idleTimer);
  session.idleTimer = undefined;
  session.controller.abort();
  session.controller = new AbortController();
  session.started = false;
};
const warmCurrentPhoto = (
  session: PhotoSession,
  source: AvifPyramidPreviewSource
) => {
  if (source.url !== session.request.avifPyramidUrl || photoSession !== session ||
      session.started || session.idleTimer !== undefined || interactionActive) return;
  const start = () => {
    session.idleTimer = undefined;
    if (photoSession !== session || session.controller.signal.aborted) return;
    if (interactionActive) return;
    if (foregroundCompositions.size) {
      session.idleTimer = setTimeout(start, 50);
      return;
    }
    const controller = session.controller,
      signal = controller.signal,
      request = effectiveWarmRequest(session),
      viewportKey = JSON.stringify([
        request.window.source,
        request.window.target,
        request.nativeSize,
      ]);
    if (session.warmedViewportKey === viewportKey) return;
    session.started = true;
    let reportedAt = 0;
    void (async () => {
      try {
      const overview = await source.ensureOverview(signal);
      signal.throwIfAborted();
      if (overview && !session.overviewPublished) {
        const canvas = compositionCanvases.acquire({
          width: overview.getWidth() as DevicePixels,
          height: overview.getHeight() as DevicePixels,
        });
        let bitmap: ImageBitmap;
        try {
          await source.drawBBoxTo(overview, [0, 0, overview.getWidth(), overview.getHeight()],
            canvas.context, { x: 0, y: 0, width: overview.getWidth(), height: overview.getHeight() }, signal);
          bitmap = await createImageBitmap(canvas.canvas, {
            imageOrientation: request.flipForTexture ? "flipY" : "none", premultiplyAlpha: "none",
          });
        } finally { canvas.release(); compositionCanvases.trim(); }
        if (signal.aborted || photoSession !== session) { bitmap.close(); return; }
        session.overviewPublished = true;
        self.postMessage({ kind: "full-image", bitmap, imageId: request.imageId,
          sourceIdentity: request.sourceIdentity ?? request.avifPyramidUrl ?? request.url,
          crop: { x: 0, y: 0, ...request.nativeSize }, sourceBackend: "avif-pyramid",
          sourceLevel: overview.level, sourceWidth: overview.getWidth(), sourceHeight: overview.getHeight(),
          sourceResidentBytes: source.residentBytes, sourceMemory: source.memoryMetrics,
          readiness: source.levelReadiness, neighborhoodReadiness: source.neighborhoodReadiness,
      workerMemory: workerMemory() }, [bitmap]);
      }
      } catch { signal.throwIfAborted(); }
      const warmOptions = {
        shouldYield: () => Boolean(foregroundCompositions.size || interactionActive),
        onProgress: () => {
          if (performance.now() - reportedAt >= 200) {
            reportedAt = performance.now(); reportSourceMemory(session, source, signal);
          }
        },
      };
      try {
        // Children covering the real crop and offset are second priority after displayed pixels.
        await source.warmNeighborhood(request.window, request.nativeSize, signal, warmOptions);
        const pan = predictedPanWindow(session);
        if (pan) await source.warmVisibleDecoded(pan, request.nativeSize, signal, warmOptions);
      } catch { signal.throwIfAborted(); }
      for (const predicted of predictedZoomWindows(session)) {
        try { await prepareZoomFrame(session, source, predicted, signal); }
        catch { signal.throwIfAborted(); }
      }
      // The whole next finer level stays compressed; critical viewport tiles were decoded above.
      await source.prewarmNextLevel(request.window, request.nativeSize, signal, warmOptions);
      // Remaining pyramid ranges are strictly idle work after the one-step neighborhood.
      await source.prewarm(request.window, request.nativeSize, signal, {
        shouldYield: () => Boolean(foregroundCompositions.size || interactionActive),
        onProgress: () => {
          if (performance.now() - reportedAt >= 200) {
            reportedAt = performance.now(); reportSourceMemory(session, source, signal);
          }
        },
      });
      if (photoSession !== session || signal.aborted) return;
      session.warmedViewportKey = viewportKey;
      reportSourceMemory(session, source, signal);
    })()
      .catch(() => {
        // Foreground pixels remain valid. Retry idle prewarming on the next settled interaction.
      })
      .finally(() => {
        if (photoSession === session && session.controller === controller)
          session.started = false;
      });
  };
  session.idleTimer = setTimeout(start, 0);
};

type PredictedZoom = { direction: "in" | "out"; window: NativePreviewWindow };
const rememberViewportMotion = (session: PhotoSession, next: NativePreviewWindow) => {
  const previous = session.lastForegroundWindow ?? session.request.window;
  const before = previous.target.width / previous.source.width;
  const after = next.target.width / next.source.width;
  const factor = after / before;
  if (factor >= 0.25 && factor <= 4 && Math.abs(factor - 1) > 0.01) {
    session.zoomFactor = factor;
    const rx = previous.source.width / next.source.width;
    const ry = previous.source.height / next.source.height;
    if (Math.abs(rx - 1) > 0.01 && Math.abs(ry - 1) > 0.01) {
      session.zoomAnchor = {
        x: Math.max(0, Math.min(session.request.nativeSize.width,
          (next.source.x * rx - previous.source.x) / (rx - 1))) as DevicePixels,
        y: Math.max(0, Math.min(session.request.nativeSize.height,
          (next.source.y * ry - previous.source.y) / (ry - 1))) as DevicePixels,
      };
    }
    session.panDelta = undefined;
  } else {
    const dx = next.source.x + next.source.width / 2 - previous.source.x - previous.source.width / 2;
    const dy = next.source.y + next.source.height / 2 - previous.source.y - previous.source.height / 2;
    if (Math.abs(dx) + Math.abs(dy) > 0.5) session.panDelta = { x: dx, y: dy };
  }
};
const predictedZoomWindows = (session: PhotoSession): PredictedZoom[] => {
  const request = effectiveWarmRequest(session);
  const step = Math.max(1.2, Math.min(2, Math.max(session.zoomFactor ?? 1.2, 1 / (session.zoomFactor ?? 1.2))));
  const inward: PredictedZoom = { direction: "in", window: forecastPreviewWindow(
    request.window, request.nativeSize, step, session.zoomAnchor,
  ) };
  const outward: PredictedZoom = { direction: "out", window: forecastPreviewWindow(
    request.window, request.nativeSize, 1 / step, session.zoomAnchor,
  ) };
  return (session.zoomFactor ?? 1.2) < 1 ? [outward, inward] : [inward, outward];
};
const predictedPanWindow = (session: PhotoSession): NativePreviewWindow | null => {
  const delta = session.panDelta;
  if (!delta) return null;
  const { source, target } = session.warmWindow;
  const x = Math.max(0, Math.min(session.request.nativeSize.width - source.width,
    source.x + Math.max(-source.width / 2, Math.min(source.width / 2, delta.x))));
  const y = Math.max(0, Math.min(session.request.nativeSize.height - source.height,
    source.y + Math.max(-source.height / 2, Math.min(source.height / 2, delta.y))));
  if (x === source.x && y === source.y) return null;
  return { source: { ...source, x: x as DevicePixels, y: y as DevicePixels }, target };
};
const prepareZoomFrame = async (
  session: PhotoSession, source: AvifPyramidPreviewSource,
  predicted: PredictedZoom, signal: AbortSignal
) => {
  const request = effectiveWarmRequest(session);
  const zoomed = predicted.window;
  const bytes = zoomed.target.width * zoomed.target.height * 4;
  if (bytes > (request.activeSourceByteLimit ?? 0)) return;
  const { image: page } = await source.select(zoomed, request.nativeSize, signal, 1);
  // An idle selection can resolve just after a new foreground request aborts it.
  signal.throwIfAborted();
  if (photoSession !== session || session.controller.signal !== signal) return;
  while (foregroundCompositions.size || interactionActive) {
    await new Promise<void>((resolve) => setTimeout(resolve, 4));
    signal.throwIfAborted();
    if (photoSession !== session || session.controller.signal !== signal) return;
  }
  // Idle owns only this lease; it must never retire a foreground composition.
  const canvas = compositionCanvases.acquire(zoomed.target);
  try {
    await composeImageViewport(canvas.context, zoomed, request.nativeSize,
      { width: page.getWidth(), height: page.getHeight() },
      (bounds, destination) => source.drawBBoxTo(page, bounds, canvas.context, destination, signal),
      { signal, shouldYield: () => Boolean(foregroundCompositions.size || interactionActive) });
    const bitmap = await createImageBitmap(canvas.canvas, {
      imageOrientation: request.flipForTexture ? "flipY" : "none", premultiplyAlpha: "none",
    });
    if (signal.aborted || photoSession !== session) { bitmap.close(); return; }
    canvas.release(); compositionCanvases.trim();
    self.postMessage({ kind: "prepared-frame", preparedDirection: predicted.direction, bitmap,
      imageId: request.imageId, sourceIdentity: request.sourceIdentity ?? request.avifPyramidUrl ?? request.url,
      crop: zoomed.source, sampleDensity: Math.min(zoomed.target.width / zoomed.source.width,
        zoomed.target.height / zoomed.source.height, source.maxSourceDensity ?? 1),
      sourceWidth: page.getWidth(), sourceHeight: page.getHeight(), sourceBackend: "avif-pyramid",
      sourceLevel: page.level, sourceResidentBytes: source.residentBytes, sourceMemory: source.memoryMetrics,
      readiness: source.levelReadiness, neighborhoodReadiness: source.neighborhoodReadiness,
      workerMemory: workerMemory() }, [bitmap]);
  } finally { canvas.release(); compositionCanvases.trim(); }
};

const jpegReadiness = (session: PhotoSession) => {
  const request=session.request;
  const active=decodedSource && cachedSourceSize.width ? Math.max(0,Math.round(Math.log2(request.nativeSize.width/cachedSourceSize.width)))
    : sourceUrl ? Number(new URL(sourceUrl).pathname.match(/\/([0-6])\/[^/]+$/)?.[1]??0) : -1;
  return Array.from({length:7-Number(request.minimumQualityLevel??0)},(_,n)=>{
    const level=n+Number(request.minimumQualityLevel??0),width=Math.ceil(request.nativeSize.width/2**level),height=Math.ceil(request.nativeSize.height/2**level);
    const decoded=level===active&&!!decodedSource,encoded=(level===active&&!!sourceBlob)||session.jpegStored?.has(level);
    return {level,width,height,cols:1,rows:1,tileWidth:width,tileHeight:height,
      states:Uint8Array.of(decoded?3:session.jpegPending===level?1:encoded?2:0),
      wholeOverviewReady:!!jpegOverview&&Math.max(width,height)<=1024,
      previouslyFetchedCells:Uint8Array.of(session.jpegFetched?.has(level)?1:0),persistentAvailabilityVerified:false};
  });
};

const retainCurrentJpeg = async (session: PhotoSession, source: ImageBitmap) => {
  const request=session.request, signal=session.controller.signal;
  const scale=Math.min(1,1024/Math.max(source.width,source.height));
  const width=Math.max(1,Math.round(source.width*scale)),height=Math.max(1,Math.round(source.height*scale));
  const density=Math.min(width/request.nativeSize.width,height/request.nativeSize.height);
  if(jpegOverview && density<=jpegOverviewDensity) return;
  const bitmap=await createImageBitmap(source,{resizeWidth:width,resizeHeight:height,resizeQuality:"low",premultiplyAlpha:"none"});
  if(signal.aborted || photoSession!==session){bitmap.close();return;}
  jpegOverview?.close();jpegOverview=bitmap;jpegOverviewDensity=density;
  const display=await createImageBitmap(bitmap,{imageOrientation:request.flipForTexture?"flipY":"none",premultiplyAlpha:"none"});
  if(signal.aborted || photoSession!==session){display.close();return;}
  self.postMessage({kind:"full-image",bitmap:display,imageId:request.imageId,sourceIdentity:request.sourceIdentity??request.url,
    crop:{x:0,y:0,...request.nativeSize},sourceWidth:source.width,sourceHeight:source.height,sourceBackend:"jpeg",
    sourceResidentBytes:(decodedSource?source.width*source.height*4:0)+bitmap.width*bitmap.height*4,workerMemory:workerMemory()},[display]);
};

const warmCurrentJpeg = (session: PhotoSession) => {
  // An early idle message may arrive before dynamic AVIF source initialization.
  // Such a session must never enter the unbounded whole-JPEG download path.
  if (session.request.avifOnly || session.request.avifPyramidUrl ||
      /\.avif$/i.test(new URL(session.request.url).pathname)) return;
  if (session.started || session.idleTimer !== undefined || interactionActive) return;
  const start = () => {
    session.idleTimer = undefined;
    if (photoSession !== session || interactionActive || session.controller.signal.aborted) return;
    if (foregroundCompositions.size) { session.idleTimer = setTimeout(start, 30); return; }
    const request = effectiveWarmRequest(session);
    const controller = session.controller;
    const signal = controller.signal;
    const key = JSON.stringify(request.window);
    if (session.warmedViewportKey === key) return;
    session.started = true;
    void (async () => {
      const cache = await Promise.race([sourceCache,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 100))]);
      const blobs = new Map<string, Blob>();
      for (const predicted of predictedZoomWindows(session)) {
        signal.throwIfAborted();
        const zoomed = predicted.window;
        const bytes = zoomed.target.width * zoomed.target.height * 4;
        const canPrepare = bytes <= (request.activeSourceByteLimit ?? 0);
        const density = Math.max(zoomed.target.width / zoomed.source.width,
          zoomed.target.height / zoomed.source.height);
        const minimum = Number(request.minimumQualityLevel ?? "0");
        const level = Math.max(minimum, Math.min(6, Math.floor(Math.log2(1 / density))));
        const url = new URL(request.url);
        if (/\/[0-6]\/[^/]+$/.test(url.pathname))
          url.pathname = url.pathname.replace(/\/[0-6]\/(?=[^/]+$)/, `/${level}/`);
        session.jpegPending = level;
        let blob = blobs.get(url.href);
        if (!blob) {
          let response = cache ? await Promise.race([
            cache.match(url.href).catch(() => undefined),
            new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 100)),
          ]) : undefined;
          signal.throwIfAborted();
          response ??= await fetch(url.href, { cache: "force-cache", priority: "low", signal });
          if (!response.ok) throw Error("JPEG prewarm unavailable");
          blob = await response.blob();
          signal.throwIfAborted();
          blobs.set(url.href, blob);
          session.jpegFetched ??= new Set(); session.jpegFetched.add(level);
          if (cache) void cache.put(url.href, new Response(blob, { headers: { "Content-Type": blob.type } }))
            .then(() => { session.jpegStored ??= new Set(); session.jpegStored.add(level); }).catch(() => {});
        }
        session.jpegPending = undefined;
        if (!canPrepare) continue;
        const size = await readJpegImageSize(blob, signal);
        const sx = size.width / request.nativeSize.width;
        const sy = size.height / request.nativeSize.height;
        const x = Math.max(0, Math.floor(zoomed.source.x * sx) - 1);
        const y = Math.max(0, Math.floor(zoomed.source.y * sy) - 1);
        const right = Math.min(size.width, Math.ceil((zoomed.source.x + zoomed.source.width) * sx) + 1);
        const bottom = Math.min(size.height, Math.ceil((zoomed.source.y + zoomed.source.height) * sy) + 1);
        if ((right - x) * (bottom - y) * 4 > (request.activeSourceByteLimit ?? 0)) continue;
        const image = await createImageBitmap(blob, x, y, right - x, bottom - y, { premultiplyAlpha: "none" });
        const canvas = compositionCanvases.acquire(zoomed.target);
        try {
          await composeImageViewport(canvas.context, zoomed, request.nativeSize, size,
            ([left, top, r, b], destination) => canvas.context.drawImage(image,
              left - x, top - y, r - left, b - top,
              destination.x, destination.y, destination.width, destination.height),
            { signal, shouldYield: () => Boolean(foregroundCompositions.size || interactionActive) });
          const bitmap = await createImageBitmap(canvas.canvas, {
            imageOrientation: request.flipForTexture ? "flipY" : "none", premultiplyAlpha: "none",
          });
          canvas.release(); compositionCanvases.trim();
          if (signal.aborted || photoSession !== session) { bitmap.close(); return; }
          self.postMessage({ kind: "prepared-frame", preparedDirection: predicted.direction, bitmap,
            imageId: request.imageId, sourceIdentity: request.sourceIdentity ?? request.url,
            crop: zoomed.source, sampleDensity: Math.min(zoomed.target.width / zoomed.source.width,
              zoomed.target.height / zoomed.source.height, sx, sy),
            sourceWidth: size.width, sourceHeight: size.height, sourceBackend: "jpeg",
            sourceResidentBytes: jpegOverview ? jpegOverview.width * jpegOverview.height * 4 : 0,
            readiness: jpegReadiness(session), workerMemory: workerMemory() }, [bitmap]);
        } finally { image.close(); canvas.release(); compositionCanvases.trim(); }
      }
      session.warmedViewportKey = key;
    })().catch(() => { /* Optional preparation cannot replace or invalidate visible pixels. */ })
      .finally(() => {
        if (photoSession === session && session.controller === controller) {
          session.started = false; session.jpegPending = undefined;
        }
      });
  };
  session.idleTimer = setTimeout(start, 0);
};

self.onmessage = async (
  event: MessageEvent<PreviewRgbRequest | BudgetOnlyRequest>
) => {
  const request = event.data;
  if (request.budgetOnly) {
    if(photoSession)photoSession.request.activeSourceByteLimit=request.activeSourceByteLimit;
    avifSource?.setActiveCacheBudget(avifCacheBudget(request));
    if (photoSession && avifSource && avifSource.url === photoSession.request.avifPyramidUrl)
      reportSourceMemory(photoSession, avifSource);
    return;
  }
  const parkedPhoto = request.park ? photoSession : null;
  if (photoSession) cancelPhotoPrewarm(photoSession);
  if (request.activity !== undefined) {
    interactionActive = request.activity;
    if (request.warmWindow && photoSession) {
      rememberViewportMotion(photoSession, request.warmWindow);
      photoSession.warmWindow = request.warmWindow;
      photoSession.lastForegroundWindow=request.warmWindow;
    }
    if (!interactionActive && photoSession) {
      if (avifSource && avifSource.url === photoSession.request.avifPyramidUrl)
        warmCurrentPhoto(photoSession, avifSource);
      else if (!photoSession.request.tiff && !photoSession.request.avifOnly &&
        !photoSession.request.avifPyramidUrl) warmCurrentJpeg(photoSession);
    }
    return;
  }
  if (request.park) {
    photoSession?.controller.abort();
    photoSession = null;
  }
  if (!request.cancel && !request.park) {
    const key = photoIdentity(request);
    if (photoSession?.key !== key) {
      photoSession?.controller.abort();
      peakWorkingBytes = 0;
      jpegOverview?.close(); jpegOverview=null; jpegOverviewDensity=0;
      photoSession = {
        key,
        request,
        warmWindow: request.window,
        controller: new AbortController(),
        started: false,
      };
    } else {
      rememberViewportMotion(photoSession, request.window);
      photoSession.request = request;
      photoSession.warmWindow = request.window;
    }
    photoSession.lastForegroundWindow = request.window;
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
    if (parkedPhoto && avifSource) {
      const parkedRequest = parkedPhoto.request;
      self.postMessage({
        kind: "source-memory",
        imageId: parkedRequest.imageId,
        sourceIdentity:
          parkedRequest.sourceIdentity ??
          parkedRequest.avifPyramidUrl ??
          parkedRequest.url,
        sourceUrl: parkedRequest.url,
        sourceResidentBytes: avifSource.residentBytes,
        sourceMemory: avifSource.memoryMetrics,
        workerMemory: workerMemory(),
      });
    }
  }
  if (request.cancel || request.park) {
    sourceAbort?.abort();
    return;
  }
  foregroundCompositions.add(epoch);
  let output: OffscreenCanvasLease | null = null;
  let bitmap: ImageBitmap | null = null;
  let published = false;
  let outputReady = false;
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
        ? Math.min(request.maxSourceDensity ?? Infinity, avifSource?.maxSourceDensity ?? 0.5)
        : cachedBackend === "tiff"
        ? 1
        : 2 ** -Number(request.minimumQualityLevel ?? "0")
    );
    const cachedSamplingWithinLimit =
      cachedCanvas &&
      cachedFrame &&
      cachedCanvas.canvas.width / cachedFrame.source.width <=
        (2 * request.window.target.width) / request.window.source.width &&
      cachedCanvas.canvas.height / cachedFrame.source.height <=
        (2 * request.window.target.height) / request.window.source.height;
    if (
      cachedCanvas &&
      cachedSamplingWithinLimit &&
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
          sourceWidth: cachedSourceSize.width,
          sourceHeight: cachedSourceSize.height,
          sourceLevel: cachedSourceLevel,
          sourceBackend: cachedBackend,
          sourceResidentBytes:
            cachedBackend === "jpeg"
              ? (decodedSource ? 1 : 0) *
                (cachedSourceSize.width ?? 0) *
                (cachedSourceSize.height ?? 0) *
                4 + (jpegOverview ? jpegOverview.width*jpegOverview.height*4 : 0)
              : avifSource?.residentBytes ?? 0,
          sourceMemory:
            cachedBackend === "avif-pyramid"
              ? avifSource?.memoryMetrics
              : undefined,
          workerMemory: workerMemory(),
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
          sourceLevel: cachedSourceLevel,
          sourceBackend: cachedBackend,
          crop: cachedFrame?.source,
          sampleDensity: cachedDensity,
          containsTiffDecoder,
          sourceResidentBytes:
            cachedBackend === "jpeg"
              ? (decodedSource ? 1 : 0) *
                (cachedSourceSize.width ?? 0) *
                (cachedSourceSize.height ?? 0) *
                4 + (jpegOverview ? jpegOverview.width*jpegOverview.height*4 : 0)
              : avifSource?.residentBytes ?? 0,
          sourceMemory:
            cachedBackend === "avif-pyramid"
              ? avifSource?.memoryMetrics
              : undefined,
          workerMemory: workerMemory(),
          complete: true,
        },
        [completed]
      );
      if (currentPhoto && avifSource && cachedBackend === "avif-pyramid")
        warmCurrentPhoto(currentPhoto, avifSource);
      return;
    }
    if (cachedCanvas) { cachedCanvas.release(); cachedCanvas = null; }
    let source: ImageBitmap | null = null;
    let pages: (
      | Awaited<ReturnType<TiffPreviewSource["select"]>>["image"]
      | AvifPreviewPage
      | string
    )[] = [];
    let usingAvif = false;
    const activeSourceLimit =
      request.activeSourceByteLimit ??
      request.retainedSourceByteLimit ??
      64 * 1024 * 1024;
    const displayDensity = Math.max(
      request.window.target.width / request.window.source.width,
      request.window.target.height / request.window.source.height
    );
    const admitJpegSource = (source: ImageBitmap) =>
      source.width * source.height * 4 <= activeSourceLimit &&
      source.width / request.nativeSize.width <= displayDensity * 2 &&
      source.height / request.nativeSize.height <= displayDensity * 2;
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
          admitJpegSource(resident) &&
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
                const exact = await cache?.match(url);
                if (exact) return exact;
                const keys = await cache?.keys();
                const candidates = keys?.filter((key) => key.url.replace(/\/[0-6]\/(?!.*\/)/,"/")===asset &&
                  Number(new URL(key.url).pathname.match(/\/([0-6])\/[^/]+$/)?.[1]??0)<=level)
                  .sort((a,b)=>Number(new URL(b.url).pathname.match(/\/([0-6])\/[^/]+$/)?.[1]??0)-Number(new URL(a.url).pathname.match(/\/([0-6])\/[^/]+$/)?.[1]??0));
                return candidates?.[0] ? cache?.match(candidates[0]) : undefined;
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
          if(currentPhoto){currentPhoto.jpegFetched??=new Set();currentPhoto.jpegFetched.add(level);}
          if (sourceAbort === download) sourceAbort = null;
          // Persist the original encoded bytes: no lossy re-encode and no main-thread compression.
          if (cache)
            sourceCacheWrite = sourceCacheWrite
              .then(async () => {
                await cache.put(url, new Response(blob,{headers:{"Content-Type":blob.type}}));
                if(currentPhoto){currentPhoto.jpegStored??=new Set();currentPhoto.jpegStored.add(level);}
                const keys=await cache.keys();
                const base=(key: Request)=>key.url.replace(/\/[0-6]\/(?!.*\/)/,"/");
                const sources=[...new Set(keys.map(base))];
                const retained=new Set([...sources.filter(value=>value!==asset).slice(-3),asset]);
                for(const key of keys) if(!retained.has(base(key))) await cache.delete(key);
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
            "./avif-pyramid-preview-source"
          );
          controller.signal.throwIfAborted();
          avifSource = new AvifPyramidPreviewSource(
            request.avifPyramidUrl,
            avifCacheBudget(request),
            request.priority
          );
        }
        const selected = await avifSource.select(
          request.window,
          request.nativeSize,
          controller.signal,
          request.maxInitialDisplayPixelSize ?? 8
        );
        // Locally encoded data can go straight to display density too; replaying
        // coarse compositions delays zoom-out even though no download is needed.
        const final = selected.refinements.at(-1) ?? selected.image;
        avifSource.setActiveCacheBudget(avifCacheBudget(request));
        const targetPage = request.refineToNative === false ? selected.image : final;
        const available = avifSource.availablePage(request.window, request.nativeSize, targetPage);
        if (available) {
          // Decoded uniform pixels publish before inventory or target fetch latency.
          pages = available.entry.scale >= targetPage.entry.scale
            ? [available] : [available, targetPage];
        } else {
          await avifSource.ensureLocalAvailability(controller.signal);
          // Prefer a uniformly available direct parent over replaying distant coarse levels.
          const scaleOf = (page: AvifPreviewPage) => page.entry?.scale ??
            Math.min(page.getWidth() / request.nativeSize.width, page.getHeight() / request.nativeSize.height);
          const targetScale = scaleOf(targetPage);
          const tolerance = Number.EPSILON * Math.max(1, targetScale) * 4;
          const parent = [selected.image, ...selected.refinements]
            .filter((page) => scaleOf(page) < targetScale - tolerance &&
              scaleOf(page) >= targetScale / 2 - tolerance)
            .sort((a, b) => scaleOf(b) - scaleOf(a))[0];
          pages = request.refineToNative === false ? [selected.image] :
            sourcePageLocallyAvailable(avifSource, final, request) ? [final] :
              parent && sourcePageLocallyAvailable(avifSource, parent, request)
                ? [parent, final] : [selected.image, ...selected.refinements];
        }
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
        const { TiffPreviewSource } = await import("./tiff-preview-source");
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
      const density = displayDensity;
      const finestLevel = Math.max(
        minimumLevel,
        Math.min(6, Math.floor(Math.log2(1 / density)))
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
                  : initialLevel - finestLevel + 1,
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
    if (usingAvif && avifSource) {
      // Each display uses one uniform level, including all newly revealed pixels.
      for (let stage = pages.length - 1; stage > 0; stage--) {
        const page = pages[stage] as AvifPreviewPage;
        if (avifSource.hasCached(page, pageViewportBounds(page, request.window, request.nativeSize))) {
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
      if (!page && source && currentPhoto && request.retainWholeImage)
        await retainCurrentJpeg(currentPhoto, source);
      const width = page?.getWidth() ?? source!.width;
      const height = page?.getHeight() ?? source!.height;
      const sourceLevel =
        usingAvif && page ? (page as AvifPreviewPage).level : undefined;
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
      if (
        cachedRefined &&
        covers &&
        cachedSamplingWithinLimit &&
        density < cachedDensity
      )
        continue;
      // Refine the same bounded crop rather than allocating the native sensor extent.
      if (!output && cachedCanvas) {
        cachedCanvas.release();
        cachedCanvas = null;
      }
      output ??= compositionCanvases.acquire(request.window.target);
      const target = output.context;
      assertPreviewExtent(output.canvas, request.window.target, "canvas");
      outputReady = false;
      await composeImageViewport(target, request.window, request.nativeSize, { width, height },
        async (bounds, destination) => {
          if (page && usingAvif) {
            await avifSource!.drawBBoxTo(page as AvifPreviewPage, bounds, target, destination, controller.signal);
            return;
          }
          const [left, top, right, bottom] = bounds;
          if (!page) {
            target.drawImage(source!, left, top, right - left, bottom - top,
              destination.x, destination.y, destination.width, destination.height);
            return;
          }
          // TIFF alone supplies raw pixels; stage a bounded crop and let Canvas2D scale it.
          const x = Math.max(0, Math.floor(left) - 1);
          const y = Math.max(0, Math.floor(top) - 1);
          const r = Math.min(width, Math.ceil(right) + 1);
          const b = Math.min(height, Math.ceil(bottom) + 1);
          const pixels = await tiffSource!.read(page as Awaited<ReturnType<TiffPreviewSource["select"]>>["image"],
            [x, y, r, b], controller.signal);
          controller.signal.throwIfAborted();
          const decode = decodeCanvases.acquire({ width: (r - x) as DevicePixels, height: (b - y) as DevicePixels });
          recordWorkingAllocation(epoch, pixels.byteLength);
          try {
            decode.context.putImageData(new ImageData(pixels, r - x, b - y), 0, 0);
            target.drawImage(decode.canvas, left - x, top - y, right - left, bottom - top,
              destination.x, destination.y, destination.width, destination.height);
          } finally {
            decode.release();
            recordWorkingAllocation(epoch, 0);
          }
        }, { signal: controller.signal, tileEdge: page && !usingAvif ? compositionTileEdge : undefined });
      if (epoch !== generation) return;
      assertPreviewExtent(output.canvas, request.window.target, "canvas");
      // ImageBitmap WebGL uploads ignore Texture.flipY; orient the pixels before transfer.
      const completed = await createImageBitmap(output.canvas, {
        imageOrientation: request.flipForTexture ? "flipY" : "none",
        premultiplyAlpha: "none",
      });
      if (epoch !== generation) {
        completed.close();
        return;
      }
      try {
        assertPreviewExtent(completed, request.window.target, "bitmap");
      } catch (error) {
        completed.close();
        throw error;
      }
      outputReady = true;
      const jpegMatchesDisplay =
        !page &&
        width / request.nativeSize.width >= displayDensity &&
        height / request.nativeSize.height >= displayDensity;
      const complete = stage === pages.length - 1 || jpegMatchesDisplay;
      if (!page && complete && source && !admitJpegSource(source)) {
        decodedSource = null;
        source.close();
      }
      {
        cachedWindowKey = windowKey;
        cachedFrame = request.window;
        cachedPhotoKey = photoKey;
        cachedDensity = density;
        cachedSourceSize = { width, height };
        cachedSourceLevel = sourceLevel;
        cachedBackend = usingAvif
          ? "avif-pyramid"
          : request.tiff
          ? "tiff"
          : "jpeg";
        cachedRefined = complete;
        cachedNativeRefinement = request.refineToNative !== false;
      }
      self.postMessage(
        {
          bitmap: completed,
          generation: request.generation,
          sourceWidth: width,
          sourceHeight: height,
          sourceLevel,
          crop: request.window.source,
          sampleDensity: density,
          containsTiffDecoder,
          sourceResidentBytes: usingAvif
            ? avifSource!.residentBytes
            : source
            ? (decodedSource ? 1 : 0) * source.width * source.height * 4 + (jpegOverview ? jpegOverview.width*jpegOverview.height*4 : 0)
            : 0,
          sourceMemory: usingAvif ? avifSource!.memoryMetrics : undefined,
          neighborhoodReadiness: usingAvif ? avifSource!.neighborhoodReadiness : undefined,
          readiness: usingAvif ? avifSource!.levelReadiness : currentPhoto && !request.tiff ? jpegReadiness(currentPhoto) : undefined,
          workerMemory: workerMemory(),
          sourceBackend: usingAvif
            ? "avif-pyramid"
            : request.tiff
            ? "tiff"
            : "jpeg",
          complete,
        },
        [completed]
      );
      published = true;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (!request.tiff && !usingAvif && complete) {
        cachedRefined = true;
        break;
      }
    }
    if (!published && failure) throw failure;
    if (published && usingAvif && avifSource && currentPhoto)
      warmCurrentPhoto(currentPhoto, avifSource);
    else if(published && !request.tiff && !usingAvif && currentPhoto) warmCurrentJpeg(currentPhoto);
  } catch (error) {
    if (epoch === generation && !controller.signal.aborted)
      self.postMessage({
        generation: request.generation,
        // A valid coarse frame must survive failure of a finer stage, but its RPC must settle.
        refinementFailed: published,
        error: error instanceof Error ? error.message : String(error),
        missing: !published && (
          (error instanceof TypeError &&
            /^(?:Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?)$/i.test(
              error.message
            )) ||
          /(?:refusing (?:404|410) full-file response|metadata unavailable \((?:404|410)\)|(?:Thumbnail preview|Preview image):\s*(?:404|410))/.test(
            error instanceof Error ? error.message : String(error)
          )),
      });
  } finally {
    workingAllocations.delete(epoch);
    foregroundCompositions.delete(epoch);
    if (output && outputReady && epoch === generation && !controller.signal.aborted &&
        !request.releaseCanvasAfterPublish) {
      // Only a finished foreground pipeline may hand its surface to the cache.
      // Published intermediate stages still mutate this lease during refinement.
      if (cachedCanvas && cachedCanvas !== output) cachedCanvas.release();
      cachedCanvas = output;
    }
    if (request.releaseCanvasAfterPublish && published && epoch === generation && output) {
      output.release();
      output = null;
      compositionCanvases.trim();
      self.postMessage({ kind: "source-memory", imageId: request.imageId,
        sourceIdentity: request.sourceIdentity ?? request.avifPyramidUrl ?? request.url,
        workerMemory: workerMemory() });
    }
    bitmap?.close();
    if (output && output !== cachedCanvas) {
      output.release();
    }
  }
};
