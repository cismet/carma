/// <reference lib="webworker" />
import { isAvifSourceMissing } from "./image-source-availability";
import { composeImageViewport } from "./compose-image-viewport";
import {
  forecastPreviewWindow,
  type NativePreviewWindow,
} from "../core/image-viewport-window";
import type { DevicePixels, Ratio } from "@carma-units";
import type {
  AvifPyramidPreviewSource,
  AvifPreviewPage,
} from "./avif-pyramid-preview-source";
import {
  OffscreenCanvasPool,
  type OffscreenCanvasLease,
} from "./offscreen-canvas-pool";

const compositionCanvases = new OffscreenCanvasPool({
  maxRetainedBytes: 0,
  maxRetainedCanvases: 0,
});
let generation = 0;
let compositionAbort: AbortController | null = null;
let cachedCanvas: OffscreenCanvasLease | null = null;
let cachedWindowKey: string | null = null;
let cachedFrame: NativePreviewWindow | null = null;
let cachedPhotoKey: string | null = null;
let cachedDensity = 0;
let cachedSourceSize: { width?: number; height?: number } = {};
let cachedSourceLevel: number | undefined;
let avifSource: AvifPyramidPreviewSource | null = null;
let avifSourceKey: string | null = null;
const unavailableAvifSources = new Map<string, number>();
const unavailableAvifErrors = new Map<string, unknown>();
let cachedRefined = false;
let cachedNativeRefinement = false;
const assertPreviewExtent = (
  surface: { width: number; height: number },
  expected: NativePreviewWindow["target"],
  kind: "canvas" | "bitmap"
) => {
  if (surface.width !== expected.width || surface.height !== expected.height)
    throw new Error(
      `Preview ${kind} extent ${surface.width}x${surface.height} differs from target ${expected.width}x${expected.height}`
    );
};

const workerMemory = () => {
  const composition = compositionCanvases.stats;
  return {
    compositionBytes: composition.activeBytes + composition.retainedBytes,
    decodeCanvasBytes: 0,
    workingBytes: 0,
    peakWorkingBytes: 0,
  };
};

type PreviewRgbRequest = {
  url: string;
  window: NativePreviewWindow;
  nativeSize: { width: DevicePixels; height: DevicePixels };
  flipForTexture: boolean;
  avifPyramidUrl?: string;
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
};
let photoSession: PhotoSession | null = null;
let interactionActive = false;
const foregroundCompositions = new Set<number>();
type AvifCacheRequest = Pick<
  PreviewRgbRequest,
  "activeSourceByteLimit" | "retainedSourceByteLimit"
>;
const avifCacheBudget = (request: AvifCacheRequest) =>
  Math.max(
    0,
    request.activeSourceByteLimit ?? request.retainedSourceByteLimit ?? 0
  );
const pageViewportBounds = (
  page: AvifPreviewPage,
  window: NativePreviewWindow,
  nativeSize: PreviewRgbRequest["nativeSize"]
): [number, number, number, number] => {
  const sx = page.entry.scale;
  const sy = page.entry.scale;
  return [
    Math.max(0, Math.floor(window.source.x * sx) - 1),
    Math.max(0, Math.floor(window.source.y * sy) - 1),
    Math.min(
      page.getWidth(),
      Math.ceil(nativeSize.width * sx),
      Math.ceil((window.source.x + window.source.width) * sx) + 1
    ),
    Math.min(
      page.getHeight(),
      Math.ceil(nativeSize.height * sy),
      Math.ceil((window.source.y + window.source.height) * sy) + 1
    ),
  ];
};
const sourcePageLocallyAvailable = (
  source: AvifPyramidPreviewSource,
  page: AvifPreviewPage,
  request: PreviewRgbRequest
) =>
  source.hasLocallyAvailable(
    page,
    pageViewportBounds(page, request.window, request.nativeSize)
  );
const photoIdentity = (request: PreviewRgbRequest) =>
  JSON.stringify([
    request.sourceIdentity ?? request.avifPyramidUrl ?? request.url,
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
  if (
    source.url !== session.request.avifPyramidUrl ||
    photoSession !== session ||
    session.started ||
    session.idleTimer !== undefined ||
    interactionActive
  )
    return;
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
            await source.drawBBoxTo(
              overview,
              [0, 0, overview.getWidth(), overview.getHeight()],
              canvas.context,
              {
                x: 0,
                y: 0,
                width: overview.getWidth(),
                height: overview.getHeight(),
              },
              signal
            );
            bitmap = await createImageBitmap(canvas.canvas, {
              imageOrientation: request.flipForTexture ? "flipY" : "none",
              premultiplyAlpha: "none",
            });
          } finally {
            canvas.release();
            compositionCanvases.trim();
          }
          if (signal.aborted || photoSession !== session) {
            bitmap.close();
            return;
          }
          session.overviewPublished = true;
          self.postMessage(
            {
              kind: "full-image",
              bitmap,
              imageId: request.imageId,
              sourceIdentity:
                request.sourceIdentity ?? request.avifPyramidUrl ?? request.url,
              crop: { x: 0, y: 0, ...request.nativeSize },
              sourceBackend: "avif-pyramid",
              sourceLevel: overview.level,
              sourceWidth: overview.getWidth(),
              sourceHeight: overview.getHeight(),
              sourceResidentBytes: source.residentBytes,
              sourceMemory: source.memoryMetrics,
              readiness: source.levelReadiness,
              neighborhoodReadiness: source.neighborhoodReadiness,
              workerMemory: workerMemory(),
            },
            [bitmap]
          );
        }
      } catch {
        signal.throwIfAborted();
      }
      const warmOptions = {
        shouldYield: () =>
          Boolean(foregroundCompositions.size || interactionActive),
        onProgress: () => {
          if (performance.now() - reportedAt >= 200) {
            reportedAt = performance.now();
            reportSourceMemory(session, source, signal);
          }
        },
      };
      let forecastsComplete = true;
      try {
        // Children covering the real crop and offset are second priority after displayed pixels.
        await source.warmNeighborhood(
          request.window,
          request.nativeSize,
          signal,
          warmOptions
        );
        const pan = predictedPanWindow(session);
        if (pan)
          await source.warmVisibleDecoded(
            pan,
            request.nativeSize,
            signal,
            warmOptions
          );
      } catch {
        signal.throwIfAborted();
        forecastsComplete = false;
      }
      for (const predicted of predictedZoomWindows(session)) {
        try {
          await prepareZoomFrame(session, source, predicted, signal);
        } catch {
          signal.throwIfAborted();
          forecastsComplete = false;
        }
      }
      // Viewport forecasts above are bounded. Idle time does not request the
      // whole next level or remaining pyramid beyond that explicit demand.
      if (photoSession !== session || signal.aborted) return;
      if (forecastsComplete) session.warmedViewportKey = viewportKey;
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
const rememberViewportMotion = (
  session: PhotoSession,
  next: NativePreviewWindow
) => {
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
        x: Math.max(
          0,
          Math.min(
            session.request.nativeSize.width,
            (next.source.x * rx - previous.source.x) / (rx - 1)
          )
        ) as DevicePixels,
        y: Math.max(
          0,
          Math.min(
            session.request.nativeSize.height,
            (next.source.y * ry - previous.source.y) / (ry - 1)
          )
        ) as DevicePixels,
      };
    }
    session.panDelta = undefined;
  } else {
    const dx =
      next.source.x +
      next.source.width / 2 -
      previous.source.x -
      previous.source.width / 2;
    const dy =
      next.source.y +
      next.source.height / 2 -
      previous.source.y -
      previous.source.height / 2;
    if (Math.abs(dx) + Math.abs(dy) > 0.5) session.panDelta = { x: dx, y: dy };
  }
};
const predictedZoomWindows = (session: PhotoSession): PredictedZoom[] => {
  const request = effectiveWarmRequest(session);
  const step = Math.max(
    1.2,
    Math.min(
      2,
      Math.max(session.zoomFactor ?? 1.2, 1 / (session.zoomFactor ?? 1.2))
    )
  );
  const inward: PredictedZoom = {
    direction: "in",
    window: forecastPreviewWindow(
      request.window,
      request.nativeSize,
      step,
      session.zoomAnchor
    ),
  };
  const outward: PredictedZoom = {
    direction: "out",
    window: forecastPreviewWindow(
      request.window,
      request.nativeSize,
      1 / step,
      session.zoomAnchor
    ),
  };
  return (session.zoomFactor ?? 1.2) < 1
    ? [outward, inward]
    : [inward, outward];
};
const predictedPanWindow = (
  session: PhotoSession
): NativePreviewWindow | null => {
  const delta = session.panDelta;
  if (!delta) return null;
  const { source, target } = session.warmWindow;
  const x = Math.max(
    0,
    Math.min(
      session.request.nativeSize.width - source.width,
      source.x +
        Math.max(-source.width / 2, Math.min(source.width / 2, delta.x))
    )
  );
  const y = Math.max(
    0,
    Math.min(
      session.request.nativeSize.height - source.height,
      source.y +
        Math.max(-source.height / 2, Math.min(source.height / 2, delta.y))
    )
  );
  if (x === source.x && y === source.y) return null;
  return {
    source: { ...source, x: x as DevicePixels, y: y as DevicePixels },
    target,
  };
};
const prepareZoomFrame = async (
  session: PhotoSession,
  source: AvifPyramidPreviewSource,
  predicted: PredictedZoom,
  signal: AbortSignal
) => {
  const request = effectiveWarmRequest(session);
  const zoomed = predicted.window;
  const bytes = zoomed.target.width * zoomed.target.height * 4;
  if (bytes > (request.activeSourceByteLimit ?? 0)) return;
  const { image: page } = await source.select(
    zoomed,
    request.nativeSize,
    signal,
    1
  );
  // An idle selection can resolve just after a new foreground request aborts it.
  signal.throwIfAborted();
  if (photoSession !== session || session.controller.signal !== signal) return;
  while (foregroundCompositions.size || interactionActive) {
    await new Promise<void>((resolve) => setTimeout(resolve, 4));
    signal.throwIfAborted();
    if (photoSession !== session || session.controller.signal !== signal)
      return;
  }
  // Idle owns only this lease; it must never retire a foreground composition.
  const canvas = compositionCanvases.acquire(zoomed.target);
  try {
    await composeImageViewport(
      canvas.context,
      zoomed,
      request.nativeSize,
      { width: page.getWidth(), height: page.getHeight() },
      (bounds, destination) =>
        source.drawBBoxTo(page, bounds, canvas.context, destination, signal),
      {
        signal,
        sourceScale: {
          x: page.entry.scale as Ratio,
          y: page.entry.scale as Ratio,
        },
        shouldYield: () =>
          Boolean(foregroundCompositions.size || interactionActive),
      }
    );
    const bitmap = await createImageBitmap(canvas.canvas, {
      imageOrientation: request.flipForTexture ? "flipY" : "none",
      premultiplyAlpha: "none",
    });
    if (signal.aborted || photoSession !== session) {
      bitmap.close();
      return;
    }
    canvas.release();
    compositionCanvases.trim();
    self.postMessage(
      {
        kind: "prepared-frame",
        preparedDirection: predicted.direction,
        bitmap,
        imageId: request.imageId,
        sourceIdentity:
          request.sourceIdentity ?? request.avifPyramidUrl ?? request.url,
        crop: zoomed.source,
        sampleDensity: Math.min(
          zoomed.target.width / zoomed.source.width,
          zoomed.target.height / zoomed.source.height,
          source.maxSourceDensity ?? 1,
          page.entry.scale
        ),
        sourceWidth: page.getWidth(),
        sourceHeight: page.getHeight(),
        sourceBackend: "avif-pyramid",
        sourceLevel: page.level,
        sourceResidentBytes: source.residentBytes,
        sourceMemory: source.memoryMetrics,
        readiness: source.levelReadiness,
        neighborhoodReadiness: source.neighborhoodReadiness,
        workerMemory: workerMemory(),
      },
      [bitmap]
    );
  } finally {
    canvas.release();
    compositionCanvases.trim();
  }
};

self.onmessage = async (
  event: MessageEvent<PreviewRgbRequest | BudgetOnlyRequest>
) => {
  const request = event.data;
  if (request.budgetOnly) {
    if (photoSession)
      photoSession.request.activeSourceByteLimit =
        request.activeSourceByteLimit;
    avifSource?.setActiveCacheBudget(avifCacheBudget(request));
    if (
      photoSession &&
      avifSource &&
      avifSource.url === photoSession.request.avifPyramidUrl
    )
      reportSourceMemory(photoSession, avifSource);
    return;
  }
  // Every image message owns one native representation. Control-only messages
  // do not open sources, and a missing native file must never retry another URL.
  if (!request.cancel && !request.park && request.activity === undefined) {
    request.avifPyramidUrl ??= request.url;
  }
  const parkedPhoto = request.park ? photoSession : null;
  if (photoSession) cancelPhotoPrewarm(photoSession);
  if (request.activity !== undefined) {
    interactionActive = request.activity;
    if (request.warmWindow && photoSession) {
      rememberViewportMotion(photoSession, request.warmWindow);
      photoSession.warmWindow = request.warmWindow;
      photoSession.lastForegroundWindow = request.warmWindow;
    }
    if (!interactionActive && photoSession) {
      if (avifSource && avifSource.url === photoSession.request.avifPyramidUrl)
        warmCurrentPhoto(photoSession, avifSource);
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
  if (request.cancel || request.park) return;
  foregroundCompositions.add(epoch);
  let output: OffscreenCanvasLease | null = null;
  let published = false;
  let outputReady = false;
  try {
    if ((unavailableAvifSources.get(request.avifPyramidUrl!) ?? 0) > Date.now())
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
      request.avifPyramidUrl ?? request.url,
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
      request.maxSourceDensity ?? Infinity,
      avifSource?.maxSourceDensity ?? 0.5
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
      (cachedNativeRefinement || request.refineToNative === false)
    ) {
      if (request.reusePublished) {
        self.postMessage({
          generation: request.generation,
          reusePublished: true,
          sourceWidth: cachedSourceSize.width,
          sourceHeight: cachedSourceSize.height,
          sourceLevel: cachedSourceLevel,
          sourceBackend: "avif-pyramid",
          sourceResidentBytes: avifSource?.residentBytes ?? 0,
          sourceMemory: avifSource?.memoryMetrics,
          workerMemory: workerMemory(),
        });
        if (currentPhoto && avifSource)
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
          sourceBackend: "avif-pyramid",
          crop: cachedFrame?.source,
          sampleDensity: cachedDensity,
          sourceResidentBytes: avifSource?.residentBytes ?? 0,
          sourceMemory: avifSource?.memoryMetrics,
          workerMemory: workerMemory(),
          complete: true,
        },
        [completed]
      );
      if (currentPhoto && avifSource)
        warmCurrentPhoto(currentPhoto, avifSource);
      return;
    }
    if (cachedCanvas) {
      cachedCanvas.release();
      cachedCanvas = null;
    }
    let pages: AvifPreviewPage[] = [];
    let usingAvif = false;
    if (
      request.avifPyramidUrl &&
      (unavailableAvifSources.get(request.avifPyramidUrl) ?? 0) <= Date.now()
    ) {
      try {
        const sourceKey = request.avifPyramidUrl;
        if (!avifSource || avifSourceKey !== sourceKey) {
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
          avifSourceKey = sourceKey;
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
        const targetPage =
          request.refineToNative === false ? selected.image : final;
        const available = avifSource.availablePage(
          request.window,
          request.nativeSize,
          targetPage
        );
        if (available) {
          // Decoded uniform pixels publish before inventory or target fetch latency.
          pages =
            available.entry.scale >= targetPage.entry.scale
              ? [available]
              : [available, targetPage];
        } else {
          await avifSource.ensureLocalAvailability(controller.signal);
          // Prefer a uniformly available direct parent over replaying distant coarse levels.
          const scaleOf = (page: AvifPreviewPage) => page.entry.scale;
          const targetScale = scaleOf(targetPage);
          const tolerance = Number.EPSILON * Math.max(1, targetScale) * 4;
          const parent = [selected.image, ...selected.refinements]
            .filter(
              (page) =>
                scaleOf(page) < targetScale - tolerance &&
                scaleOf(page) >= targetScale / 2 - tolerance
            )
            .sort((a, b) => scaleOf(b) - scaleOf(a))[0];
          pages =
            request.refineToNative === false
              ? [selected.image]
              : sourcePageLocallyAvailable(avifSource, final, request)
              ? [final]
              : parent &&
                sourcePageLocallyAvailable(avifSource, parent, request)
              ? [parent, final]
              : [selected.image, ...selected.refinements];
        }
        usingAvif = true;
        unavailableAvifSources.delete(request.avifPyramidUrl);
        unavailableAvifErrors.delete(request.avifPyramidUrl);
      } catch (error) {
        controller.signal.throwIfAborted();
        avifSource?.close();
        avifSource = null;
        if (!isAvifSourceMissing(error)) throw error;
        unavailableAvifErrors.set(request.avifPyramidUrl, error);
        unavailableAvifSources.set(
          request.avifPyramidUrl,
          Date.now() + 5 * 60 * 1000
        );
        while (unavailableAvifSources.size > 16) {
          const oldest = unavailableAvifSources.keys().next().value!;
          unavailableAvifSources.delete(oldest);
          unavailableAvifErrors.delete(oldest);
        }
      }
    }
    if (!usingAvif)
      throw (
        unavailableAvifErrors.get(request.avifPyramidUrl!) ??
        Error("AVIF pyramid is unavailable or unsupported")
      );
    if (usingAvif && avifSource) {
      // Each display uses one uniform level, including all newly revealed pixels.
      for (let stage = pages.length - 1; stage > 0; stage--) {
        const page = pages[stage];
        if (
          avifSource.hasCached(
            page,
            pageViewportBounds(page, request.window, request.nativeSize)
          )
        ) {
          pages = pages.slice(stage);
          break;
        }
      }
    }
    for (const [stage, page] of pages.entries()) {
      controller.signal.throwIfAborted();
      const width = page.getWidth();
      const height = page.getHeight();
      const sourceLevel = page.level;
      const density = Math.min(
        page.entry.scale,
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
      // Another job may have replaced the module-level lease while this one awaited.
      const previous = cachedCanvas as OffscreenCanvasLease | null;
      if (!output && previous) {
        previous.release();
        cachedCanvas = null;
      }
      output ??= compositionCanvases.acquire(request.window.target);
      const target = output.context;
      assertPreviewExtent(output.canvas, request.window.target, "canvas");
      outputReady = false;
      await composeImageViewport(
        target,
        request.window,
        request.nativeSize,
        { width, height },
        (bounds, destination) =>
          avifSource!.drawBBoxTo(
            page,
            bounds,
            target,
            destination,
            controller.signal
          ),
        {
          signal: controller.signal,
          sourceScale: {
            x: page.entry.scale as Ratio,
            y: page.entry.scale as Ratio,
          },
        }
      );
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
      const complete = stage === pages.length - 1;
      {
        cachedWindowKey = windowKey;
        cachedFrame = request.window;
        cachedPhotoKey = photoKey;
        cachedDensity = density;
        cachedSourceSize = { width, height };
        cachedSourceLevel = sourceLevel;
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
          sourceResidentBytes: avifSource!.residentBytes,
          sourceMemory: avifSource!.memoryMetrics,
          neighborhoodReadiness: avifSource!.neighborhoodReadiness,
          readiness: avifSource!.levelReadiness,
          workerMemory: workerMemory(),
          sourceBackend: "avif-pyramid",
          complete,
        },
        [completed]
      );
      published = true;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (published && avifSource && currentPhoto)
      warmCurrentPhoto(currentPhoto, avifSource);
  } catch (error) {
    if (epoch === generation && !controller.signal.aborted)
      self.postMessage({
        generation: request.generation,
        // A valid coarse frame must survive failure of a finer stage, but its RPC must settle.
        refinementFailed: published,
        error: error instanceof Error ? error.message : String(error),
        missing: !published && isAvifSourceMissing(error),
      });
  } finally {
    foregroundCompositions.delete(epoch);
    if (
      output &&
      outputReady &&
      epoch === generation &&
      !controller.signal.aborted &&
      !request.releaseCanvasAfterPublish
    ) {
      // Only a finished foreground pipeline may hand its surface to the cache.
      // Published intermediate stages still mutate this lease during refinement.
      if (cachedCanvas && cachedCanvas !== output) cachedCanvas.release();
      cachedCanvas = output;
    }
    if (
      request.releaseCanvasAfterPublish &&
      published &&
      epoch === generation &&
      output
    ) {
      output.release();
      output = null;
      compositionCanvases.trim();
      self.postMessage({
        kind: "source-memory",
        imageId: request.imageId,
        sourceIdentity:
          request.sourceIdentity ?? request.avifPyramidUrl ?? request.url,
        workerMemory: workerMemory(),
      });
    }
    if (output && output !== cachedCanvas) {
      output.release();
    }
  }
};
