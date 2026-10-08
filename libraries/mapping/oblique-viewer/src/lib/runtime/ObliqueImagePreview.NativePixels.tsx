/// <reference types="vite/client" />
import { useEffect, useRef, useState, type RefObject } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  degToRad,
  type Degrees,
  type CssPixels,
  type DevicePixels,
  type Ratio,
} from "@carma-units";
import {
  ImageViewportPool,
  nativePreviewWindow,
  type NativePreviewWindow,
  type ImagePreparedFrame,
} from "@carma-commons/image-streaming";
import {
  useScenePreviewImage,
  type ScenePreviewImageContent,
  type ScenePreviewImageGeometry,
  type ScenePreviewPhoto,
} from "./hooks/useScenePreviewImage";
import { readCameraToCenterDistancePx } from "./utils/cameraMath";
import {
  PREVIEW_HEIGHT_VAR,
  PREVIEW_WIDTH_VAR,
} from "./hooks/usePreviewSizeSync";
import type { PreviewQualityLevel } from "../core/constants";
import type { ObliqueBackdropLook } from "../core/types";
import type { PreviewBackdropTint } from "./utils/preview-backdrop";

import {
  isPreviewSourceMissing,
  reportPreviewSourceMissing,
  reportPreviewSourceAvailable,
  subscribePreviewThumbnail,
} from "./utils/preview-thumbnail-cache";

type WorkerMemorySnapshot = {
  compositionBytes: number;
  decodeCanvasBytes: number;
  workingBytes: number;
};
type AvifSourceMemorySnapshot = {
  rangeBytes: number;
  decodedBytes: number;
  residentBytes: number;
  rangeCount: number;
  decodedTileCount: number;
  decodedPixels: number;
  largestDecodedTilePixels: number;
};
type PreviewMemorySnapshot = {
  imageId: string;
  viewportPixels: number;
  imageBytes: number;
  imageBudgetBytes: number;
  renderBudgetBytes?: number;
  sourceCacheBudgetBytes?: number;
  sourceResidentBytes: number;
  sourceMemory?: AvifSourceMemorySnapshot;
  workerResidentBytes: number;
  estimatedGpuBytes: number;
  poolInstances: number;
  poolBytes: number;
  poolBudgetBytes: number;
};
let lastMemorySignature = "";
let lastMemoryContext: PreviewMemorySnapshot | undefined;
let lastMemoryImageId = "";
let publishingNativeState = false;
const rasterBytes = (image: { width: number; height: number } | null) =>
  image ? image.width * image.height * 4 : 0;
const retentionPolicy = () => {
  const memory =
    (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const small =
    memory <= 2 ||
    globalThis.matchMedia?.("(pointer: coarse)").matches === true;
  return {
    maxCount: small ? 4 : 8,
    byteLimit: (small ? 128 : 256) * 1024 * 1024,
    sourceBytes: (small ? 4 : 8) * 1024 * 1024,
  };
};
const nativePixelPool = new ImageViewportPool({
  limits: () => {
    const policy = retentionPolicy();
    return {
      maxImages: policy.maxCount,
      maxBytes: policy.byteLimit,
      retainedSourceBytes: policy.sourceBytes,
    };
  },
});
import.meta.hot?.dispose(() => nativePixelPool.dispose());
const cropCovers = (
  outer: NativePreviewWindow["source"],
  inner: NativePreviewWindow["source"],
  pixels: NativePreviewWindow["target"]
) => {
  const marginX = outer.width / pixels.width / 2,
    marginY = outer.height / pixels.height / 2;
  return (
    outer.x - marginX <= inner.x &&
    outer.y - marginY <= inner.y &&
    outer.x + outer.width + marginX >= inner.x + inner.width &&
    outer.y + outer.height + marginY >= inner.y + inner.height
  );
};
const MAX_FULL_IMAGE_PIXELS = 4 * 1024 * 1024;
let compositionGeneration = 0;

const publishMemoryMetrics = (
  imageId: string,
  current?: PreviewMemorySnapshot
) => {
  lastMemoryImageId = imageId;
  lastMemoryContext = current;
  const pool = nativePixelPool.metrics;
  const poolBytes = pool.managedBytes;
  const poolBudgetBytes = pool.images.reduce(
    (sum, entry) => sum + entry.budgetBytes,
    0
  );
  const activeImage=pool.images.find(entry=>entry.active&&entry.id===imageId);
  const snapshot: PreviewMemorySnapshot = {
    imageId,
    viewportPixels: current?.viewportPixels ?? 0,
    imageBytes: activeImage?.managedBytes ?? current?.imageBytes ?? 0,
    imageBudgetBytes: activeImage?.budgetBytes ?? current?.imageBudgetBytes ?? 0,
    renderBudgetBytes: activeImage?.renderBudgetBytes ?? current?.renderBudgetBytes,
    sourceCacheBudgetBytes: activeImage?.cacheBudgetBytes ?? current?.sourceCacheBudgetBytes,
    sourceResidentBytes: current?.sourceResidentBytes ?? 0,
    sourceMemory: current?.sourceMemory,
    workerResidentBytes: current?.workerResidentBytes ?? 0,
    estimatedGpuBytes: current?.estimatedGpuBytes ?? 0,
    poolInstances: pool.images.length,
    poolBytes,
    poolBudgetBytes: Math.min(poolBudgetBytes, retentionPolicy().byteLimit),
  };
  const signature = JSON.stringify(snapshot);
  if (signature === lastMemorySignature) return;
  lastMemorySignature = signature;
  globalThis.window.dispatchEvent(
    new CustomEvent<PreviewMemorySnapshot>("carma-oblique-preview-memory", {
      detail: snapshot,
    })
  );
};

nativePixelPool.subscribe(() => {
  if (!publishingNativeState)
    publishMemoryMetrics(lastMemoryImageId, lastMemoryContext);
});

/** Assemble the visible source window in a reusable, cancellable worker. */
export const NativePixels = ({
  map,
  photo,
  rootRef,
  path,
  imageId,
  nativeSize,
  halfFovTan,
  principal,
  rollDeg,
  dimImage,
  sourceUrl,
  tiff = false,
  avifPyramidUrl,
  avifOnly = false,
  minimumQualityLevel = "0",
  onSourceLoaded,
  onFullImage,
  retainWholeImage = false,
  onOutlineReady,
  onDisplayReady,
  onError,
  backdropLook,
  backdropTint,
  showBasemapLabels = true,
}: {
  map: MaplibreMap;
  photo?: ScenePreviewPhoto;
  rootRef: RefObject<HTMLElement>;
  path?: string;
  imageId: string;
  nativeSize: { width: DevicePixels; height: DevicePixels };
  halfFovTan: number;
  principal: { xOffset: number; yOffset: number };
  rollDeg: number;
  dimImage: boolean;
  sourceUrl: string;
  tiff?: boolean;
  avifPyramidUrl?: string;
  avifOnly?: boolean;
  minimumQualityLevel?: PreviewQualityLevel;
  onSourceLoaded?: (url: string, width: number, height: number) => void;
  /** Ownership of the bounded whole-image fallback transfers to this callback. */
  onFullImage?: (bitmap: ImageBitmap) => void;
  /** Main photo preview only; object coverage readers remain ROI-only. */
  retainWholeImage?: boolean;
  onError?: (
    imageId: string,
    details?: { message: string; missing: boolean }
  ) => void;
  onOutlineReady?: () => void;
  /** Accepted pixels meet the current physical display requirement. */
  onDisplayReady?: () => void;
  backdropLook?: ObliqueBackdropLook;
  backdropTint?: PreviewBackdropTint;
  showBasemapLabels?: boolean;
}) => {
  const sourceIdentity = tiff
    ? sourceUrl
    : sourceUrl.replace(/\/[0-6]\/(?=[^/]+$)/, "/");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<ScenePreviewImageContent | null>(null);
  const scheduleRef = useRef<
    ((geometry: ScenePreviewImageGeometry) => void) | null
  >(null);
  const callbacksRef = useRef({
    onSourceLoaded,
    onFullImage,
    onError,
    onOutlineReady,
    onDisplayReady,
  });
  callbacksRef.current = {
    onSourceLoaded,
    onFullImage,
    onError,
    onOutlineReady,
    onDisplayReady,
  };
  const lastSourceRef = useRef<string | null>(null);
  const sourceUrlRef = useRef(sourceUrl);
  sourceUrlRef.current = sourceUrl;
  // These states serve only the DOM fallback. Shared-scene publication is synchronous.
  const [ready, setReady] = useState(false);
  const [previewWindow, setPreviewWindow] =
    useState<NativePreviewWindow | null>(null);
  const sceneImage = useScenePreviewImage({
    map,
    photo,
    contentRef,
    shown: !dimImage,
    onOutlineReady,
    halfFovTan,
    nativeSize,
    principal,
    rollDeg,
    priority: 1,
    backdropLook,
    backdropTint,
    showBasemapLabels,
    onBeforeRender: (geometry) => scheduleRef.current?.(geometry),
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !rootRef.current || dimImage) return undefined;
    let timer: number | undefined;
    let timeout: number | undefined;
    let worker: Worker | null = null;
    let foregroundInFlight = false;
    let published: ImageBitmap | null = null;
    let pendingPrepared: ImagePreparedFrame | null = null;
    let publishedFrame: NativePreviewWindow | null = null;
    let publishedComplete = false;
    let publishedDensity = 0;
    let publishedBackend: string | undefined;
    let containsTiffDecoder = false;
    let currentRequestConfirmedAvif = false;
    let publishedSourceSize: { width?: number; height?: number } = {};
    let workerCanvasBytes = 0;
    let workerMemory: WorkerMemorySnapshot | undefined;
    let lastSentSourceByteLimit = -1;
    let previousGeometry: ScenePreviewImageGeometry | null = null;
    let started = false;
    let disposed = false;
    let generation = ++compositionGeneration;
    const retainedSourceByteLimitCap = retentionPolicy().sourceBytes;
    let retainedSourceByteLimit = retainedSourceByteLimitCap;
    let activeSourceByteLimit = 0;
    let viewportPixels = 0;
    let sourceMemory: AvifSourceMemorySnapshot | undefined;
    const photoSourceIdentity = new URL(
      avifPyramidUrl ?? sourceIdentity,
      globalThis.window.location.href
    ).href;
    let sourceResidentBytes = 0;
    let fullImageBytes = 0;
    const lease = nativePixelPool.acquireProtocol({
      id: imageId,
      url: new URL(sourceIdentity, globalThis.window.location.href).href,
      kind: avifOnly ? "avif" : tiff ? "tiff" : "jpeg",
      maxSourceDensity: avifOnly ? 0.5 : undefined,
      nativeSize,
      minimumQualityLevel,
      flipForTexture: sceneImage,
      sourceIdentity: photoSourceIdentity,
      avifPyramidUrl,
      avifOnly,
    });
    const retained = lease.retained;
    worker = lease.worker;
    sourceResidentBytes = retained?.sourceResidentBytes ?? 0;
    sourceMemory = retained?.sourceMemory as
      | AvifSourceMemorySnapshot
      | undefined;
    workerMemory = retained?.workerMemory;
    viewportPixels = retained?.viewportPixels ?? 0;
    const workerRasterBytes = () =>
      worker
        ? workerMemory
          ? workerMemory.compositionBytes +
            workerMemory.decodeCanvasBytes +
            workerMemory.workingBytes
          : workerCanvasBytes
        : 0;
    const rasterResidentBytes = () =>
      rasterBytes(published) +
      fullImageBytes +
      (sceneImage ? rasterBytes(published) : rasterBytes(canvas)) +
      workerRasterBytes();
    const publishPoolState = () => {
      publishingNativeState = true;
      try {
        lease.bindWorker(worker);
        lease.publish({
          bitmap: published,
          frame: publishedFrame,
          density: publishedDensity,
          complete: publishedComplete,
          sourceWidth: publishedSourceSize.width,
          sourceHeight: publishedSourceSize.height,
          backend: publishedBackend,
          viewportPixels,
          sourceResidentBytes,
          sourceMemory,
          workerMemory,
          workerCanvasBytes,
          displayCopyBytes: sceneImage
            ? rasterBytes(published)
            : rasterBytes(canvas),
          externalBytes: fullImageBytes,
        });
      } finally {
        publishingNativeState = false;
      }
    };
    const updateSourceBudget = () => {
      publishPoolState();
      activeSourceByteLimit = lease.sourceBudget();
      retainedSourceByteLimit = lease.retainedSourceBudget();
      if (worker && activeSourceByteLimit !== lastSentSourceByteLimit) {
        lastSentSourceByteLimit = activeSourceByteLimit;
        worker.postMessage({ budgetOnly: true, activeSourceByteLimit });
      }
    };
    const accountActive = () => {
      const imageBytes =
        rasterResidentBytes() + (worker ? sourceResidentBytes : 0);
      publishPoolState();
      const metrics: PreviewMemorySnapshot = {
        imageId,
        viewportPixels,
        imageBytes,
        imageBudgetBytes: viewportPixels * 4 * 4,
        sourceResidentBytes,
        sourceMemory,
        workerResidentBytes: workerRasterBytes(),
        estimatedGpuBytes: sceneImage ? rasterBytes(published) : 0,
        poolInstances: 0,
        poolBytes: 0,
        poolBudgetBytes: 0,
      };
      publishMemoryMetrics(imageId, metrics);
    };
    if (retained?.bitmap && retained.frame) {
      published = retained.bitmap;
      publishedFrame = retained.frame;
      publishedComplete = retained.complete;
      publishedDensity = retained.density;
      publishedBackend = retained.backend;
      currentRequestConfirmedAvif = retained.backend === "avif-pyramid";
      publishedSourceSize = {
        width: retained.sourceWidth,
        height: retained.sourceHeight,
      };
      workerCanvasBytes = worker ? rasterBytes(published) : 0;
      if (sceneImage)
        contentRef.current = { source: published, crop: retained.frame.source };
      else {
        canvas.width = published.width;
        canvas.height = published.height;
        canvas.getContext("2d")?.drawImage(published, 0, 0);
        setPreviewWindow(retained.frame);
        setReady(true);
      }
      if (retained.sourceWidth && retained.sourceHeight) {
        const requestedUrl = sourceUrlRef.current;
        lastSourceRef.current = new URL(
          requestedUrl,
          globalThis.window.location.href
        ).href;
        callbacksRef.current.onSourceLoaded?.(
          requestedUrl,
          retained.sourceWidth,
          retained.sourceHeight
        );
      }
      map.triggerRepaint();
    }
    accountActive();
    let scheduledUrl: string | null = null;
    let latestGeometry: ScenePreviewImageGeometry | null = null;
    let geometryQueued = false;
    let awaitingAvailability = false;
    const availabilitySource = {
      previewPath: path ?? "",
      imageId,
      originalImageUrl: tiff ? sourceUrlRef.current : undefined,
      avifPyramidUrl,
      avifOnly,
      nativeSize,
    };
    const cancel = () => {
      geometryQueued = false;
      pendingPrepared?.bitmap.close(); pendingPrepared=null;
      generation = ++compositionGeneration;
      globalThis.window.clearTimeout(timer);
      globalThis.window.clearTimeout(timeout);
      if (foregroundInFlight) {
        foregroundInFlight = false;
        worker?.postMessage({ cancel: true });
      }
    };
    const schedule = (geometry: ScenePreviewImageGeometry) => {
      latestGeometry = geometry;
      const requestedUrl = sourceUrlRef.current;
      const url = new URL(requestedUrl, globalThis.window.location.href).href;
      if (foregroundInFlight && url !== scheduledUrl) cancel();
      if (foregroundInFlight) {
        // Let an admitted tile/decode request finish; restarting it on every
        // camera frame starves the preview while the same ranges are in flight.
        geometryQueued = true;
        return;
      }
      if (disposed || (geometry === previousGeometry && url === scheduledUrl))
        return;
      scheduledUrl = url;
      previousGeometry = geometry;
      const frame = nativePreviewWindow(
        geometry.viewport,
        geometry.image,
        nativeSize,
        geometry.offset,
        principal,
        degToRad(rollDeg as Degrees),
        geometry.pixelRatio
      );
      if (frame) {
        lease.setTarget(frame);
        viewportPixels =
          Math.ceil(geometry.viewport.width * geometry.pixelRatio) *
          Math.ceil(geometry.viewport.height * geometry.pixelRatio);
        updateSourceBudget();
        accountActive();
      }
      const neededDensity =
        frame &&
        Math.min(
          frame.target.width / frame.source.width,
          frame.target.height / frame.source.height,
          publishedBackend === "avif-pyramid"
            ? 0.5
            : tiff
            ? 1
            : 2 ** -Number(minimumQualityLevel)
        );
      // The pool protects the previous zoom level; reuse a fully covering
      // local buffer before asking the worker to reconstruct it from tiles.
      const buffered = frame && url === lastSourceRef.current ? lease.borrowFrame(frame) : null;
      if (buffered && buffered.bitmap !== published) {
        published = buffered.bitmap;
        publishedFrame = buffered.frame;
        publishedDensity = buffered.density;
        publishedBackend = buffered.input?.backend;
        publishedComplete = publishedDensity >= neededDensity!;
        publishedSourceSize = { width: buffered.input?.width, height: buffered.input?.height };
        if (sceneImage) {
          contentRef.current = { source: published, crop: publishedFrame.source };
          map.triggerRepaint();
        } else {
          canvas.width = published.width;
          canvas.height = published.height;
          canvas.getContext("2d")?.drawImage(published, 0, 0);
          setPreviewWindow(publishedFrame);
          setReady(true);
        }
        accountActive();
      }
      if (
        frame &&
        published &&
        publishedFrame &&
        url === lastSourceRef.current &&
        cropCovers(
          publishedFrame.source,
          frame.source,
          publishedFrame.target
        ) &&
        publishedDensity >= neededDensity! &&
        publishedDensity <= neededDensity! * 2 &&
        (!retainWholeImage || started)
      ) {
        // Existing pixels stay aligned by the shared-frame matrix; no RPC or upload.
        globalThis.window.clearTimeout(timer);
        timer = undefined;
        callbacksRef.current.onDisplayReady?.();
        return;
      }
      let prepared = frame ? lease.takePrepared(frame) : null;
      cancel();
      pendingPrepared=prepared;
      if (!frame) return;
      const releasePrepared = () => {
        if(pendingPrepared===prepared){prepared?.bitmap.close();pendingPrepared=null;}
        prepared=null;
      };
      const epoch = generation;
      const start = () => {
        if (disposed || epoch !== generation) { releasePrepared(); return; }
        const samePublishedSource = published && publishedFrame &&
          url === lastSourceRef.current;
        if (map.isMoving?.() && !prepared && !samePublishedSource) {
          timer = globalThis.window.setTimeout(start, 16);
          return;
        }
        const missingSource = availabilitySource;
        if (isPreviewSourceMissing(missingSource)) {
          releasePrepared();
          awaitingAvailability = true;
          callbacksRef.current.onError?.(imageId, {
            message: "Preview source unavailable (cached 404/410)",
            missing: true,
          });
          return;
        }
        let currentWorker: Worker;
        try {
          currentWorker = worker ?? lease.createWorker();
        } catch {
          releasePrepared();
          return;
        }
        worker = currentWorker;
        lastSentSourceByteLimit = activeSourceByteLimit;
        currentRequestConfirmedAvif = false;
        started = true;
        accountActive();
        let jobTimeout: number | undefined;
        const finish = (error?: string, missing = false, completed = false) => {
          globalThis.window.clearTimeout(jobTimeout);
          if (error || completed) foregroundInFlight = false;
          if (completed && geometryQueued && !disposed && epoch === generation) {
            geometryQueued = false;
            queueMicrotask(() => {
              if (!disposed && epoch === generation && latestGeometry) {
                previousGeometry = null;
                schedule(latestGeometry);
              }
            });
          }
          if (error) {
            currentWorker.terminate();
            if (worker === currentWorker) worker = null;
            sourceResidentBytes = 0;
            sourceMemory = undefined;
            workerMemory = undefined;
            workerCanvasBytes = 0;
            accountActive();
          }
          if (error && !disposed && epoch === generation) {
            if (missing) {
              awaitingAvailability = true;
              reportPreviewSourceMissing(missingSource);
            }
            callbacksRef.current.onError?.(imageId, {
              message: error,
              missing,
            });
          }
          if (error && !disposed && epoch === generation && import.meta.env.DEV)
            console.warn("Native RGB preview unavailable", error);
        };
        currentWorker.onmessage = (
          event: MessageEvent<{
            bitmap?: ImageBitmap;
            error?: string;
            missing?: boolean;
            generation?: number;
            sourceWidth?: number;
            sourceHeight?: number;
            crop?: NativePreviewWindow["source"];
            complete?: boolean;
            sampleDensity?: number;
            sourceBackend?: string;
            containsTiffDecoder?: boolean;
            kind?: "full-image" | "source-memory" | "prepared-frame";
            imageId?: string;
            sourceIdentity?: string;
            sourceUrl?: string;
            sourceResidentBytes?: number;
            sourceMemory?: AvifSourceMemorySnapshot;
            workerMemory?: WorkerMemorySnapshot;
            reusePublished?: boolean;
          }>
        ) => {
          const bitmap = event.data.bitmap;
          const updateResidentBytes = () => {
            const bytes = event.data.sourceResidentBytes;
            if (event.data.sourceMemory) sourceMemory = event.data.sourceMemory;
            if (event.data.workerMemory) workerMemory = event.data.workerMemory;
            if (bytes !== undefined && Number.isFinite(bytes) && bytes >= 0) {
              sourceResidentBytes = bytes;
              updateSourceBudget();
              accountActive();
            } else if (event.data.sourceMemory || event.data.workerMemory) {
              updateSourceBudget();
              accountActive();
            }
          };
          if (event.data.kind === "prepared-frame") {
            if (disposed || worker !== currentWorker || event.data.imageId !== imageId ||
              event.data.sourceIdentity !== photoSourceIdentity || !bitmap || !event.data.crop || event.data.sampleDensity===undefined) {
              bitmap?.close(); return;
            }
            updateResidentBytes();
            lease.storePrepared(event.data as ImagePreparedFrame);
            return;
          }
          if (
            event.data.kind === "full-image" ||
            event.data.kind === "source-memory"
          ) {
            if (
              disposed ||
              worker !== currentWorker ||
              event.data.imageId !== imageId ||
              event.data.sourceIdentity !== photoSourceIdentity
            ) {
              bitmap?.close();
              return;
            }
            updateResidentBytes();
            if (event.data.kind === "source-memory") return;
            const crop = event.data.crop;
            if (
              !bitmap ||
              !retainWholeImage ||
              !callbacksRef.current.onFullImage ||
              bitmap.width * bitmap.height > MAX_FULL_IMAGE_PIXELS ||
              (crop &&
                (crop.x !== 0 ||
                  crop.y !== 0 ||
                  crop.width !== nativeSize.width ||
                  crop.height !== nativeSize.height))
            ) {
              bitmap?.close();
              return;
            }
            fullImageBytes = rasterBytes(bitmap);
            callbacksRef.current.onFullImage(bitmap);
            updateSourceBudget();
            accountActive();
            return;
          }
          if (
            disposed ||
            epoch !== generation ||
            requestedUrl !== sourceUrlRef.current ||
            (event.data.generation !== undefined &&
              event.data.generation !== epoch)
          ) {
            bitmap?.close();
            return;
          }
          updateResidentBytes();
          if (event.data.reusePublished && published && !event.data.error) {
            bitmap?.close();
            finish(undefined, false, true);
            return;
          }
          if (!bitmap || event.data.error) {
            bitmap?.close();
            finish(
              event.data.error || "No RGB bitmap",
              event.data.missing === true
            );
            return;
          }
          awaitingAvailability = false;
          reportPreviewSourceAvailable(availabilitySource);
          const crop = event.data.crop ?? frame.source;
          const density = Math.min(
            event.data.sampleDensity ?? Infinity,
            (event.data.sourceWidth ?? nativeSize.width) / nativeSize.width,
            (event.data.sourceHeight ?? nativeSize.height) / nativeSize.height,
            bitmap.width / crop.width,
            bitmap.height / crop.height
          );
          if (
            published &&
            publishedFrame &&
            density < publishedDensity &&
            (
              // A sharper old crop protects only the area it actually covers.
              (cropCovers(publishedFrame.source, frame.source, publishedFrame.target) &&
                !(publishedDensity > neededDensity! * 2 && density >= neededDensity!)) ||
              // Keep the sharp center until an uncached expansion is sufficiently detailed.
              (density < neededDensity! / 2)
            )
          ) {
            bitmap.close();
            finish(undefined, false, event.data.complete !== false);
            return;
          }
          publishedFrame = {
            source: crop,
            target: {
              width: bitmap.width as DevicePixels,
              height: bitmap.height as DevicePixels,
            },
          };
          publishedComplete = event.data.complete ?? true;
          publishedDensity = density;
          publishedBackend = event.data.sourceBackend;
          currentRequestConfirmedAvif =
            event.data.sourceBackend === "avif-pyramid";
          containsTiffDecoder ||= event.data.containsTiffDecoder === true;
          publishedSourceSize = {
            width: event.data.sourceWidth,
            height: event.data.sourceHeight,
          };
          workerCanvasBytes = rasterBytes(bitmap);
          published = bitmap;
          if (sceneImage) {
            contentRef.current = { source: bitmap, crop };
            map.triggerRepaint();
          } else {
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const context = canvas.getContext("2d");
            if (context) {
              context.drawImage(bitmap, 0, 0);
              setPreviewWindow(publishedFrame);
              setReady(true);
            }
          }
          // Bitmap ownership and the previous zoom buffers belong to the shared pool.
          updateSourceBudget();
          accountActive();
          if (
            lastSourceRef.current !== url &&
            event.data.sourceWidth &&
            event.data.sourceHeight
          ) {
            lastSourceRef.current = url;
            callbacksRef.current.onSourceLoaded?.(
              requestedUrl ?? url,
              event.data.sourceWidth,
              event.data.sourceHeight
            );
          }
          if (event.data.complete !== false && density >= neededDensity!)
            callbacksRef.current.onDisplayReady?.();
          finish(undefined, false, event.data.complete !== false);
        };
        currentWorker.onerror = () => finish("RGB worker failed");
        currentWorker.onmessageerror = () =>
          finish("RGB bitmap transfer failed");
        if (prepared) {
          const ready = prepared; pendingPrepared=null; prepared = null;
          currentWorker.onmessage?.call(currentWorker, new MessageEvent("message", {
            data: {...ready, kind:undefined, generation: epoch, complete: true},
          }));
          currentWorker.postMessage({activity:false,warmWindow:frame});
          return;
        }
        jobTimeout = globalThis.window.setTimeout(
          () => finish("RGB worker timed out"),
          90000
        );
        timeout = jobTimeout;
        try {
          foregroundInFlight = true;
          currentWorker.postMessage({
            url,
            window: frame,
            nativeSize,
            flipForTexture: sceneImage,
            tiff,
            avifPyramidUrl: avifPyramidUrl
              ? new URL(avifPyramidUrl, globalThis.window.location.href).href
              : undefined,
            avifOnly,
            minimumQualityLevel,
            generation: epoch,
            retainedSourceByteLimit,
            activeSourceByteLimit,
            retainWholeImage,
            releaseCanvasAfterPublish: true,
            imageId,
            sourceIdentity: photoSourceIdentity,
            reusePublished: !!published,
          });
        } catch {
          finish("RGB request transfer failed");
        }
      };
      if (prepared || !map.isMoving?.()) start();
      else timer = globalThis.window.setTimeout(start, 16);
    };
    const unsubscribeAvailability = subscribePreviewThumbnail(
      availabilitySource,
      () => {
        if (
          disposed ||
          !awaitingAvailability ||
          isPreviewSourceMissing(availabilitySource) ||
          !latestGeometry
        )
          return;
        awaitingAvailability = false;
        previousGeometry = null;
        schedule(latestGeometry);
      }
    );
    let backgroundPaused = false;
    let idleTimer: number | undefined;
    const currentWarmWindow = () => {
      if (!retainWholeImage || !latestGeometry) return undefined;
      return nativePreviewWindow(
        latestGeometry.viewport,
        latestGeometry.image,
        nativeSize,
        latestGeometry.offset,
        principal,
        degToRad(rollDeg as Degrees),
        latestGeometry.pixelRatio
      );
    };
    const movementStarted = () => {
      globalThis.window.clearTimeout(idleTimer);
      backgroundPaused = true;
      const warmWindow = currentWarmWindow();
      worker?.postMessage({
        activity: true,
        ...(warmWindow ? { warmWindow } : {}),
      });
      // The next shared frame cancels only a crop that actually needs new pixels.
      previousGeometry = null;
      previousFallback = [];
    };
    const movementEnded = () => {
      globalThis.window.clearTimeout(idleTimer);
      idleTimer = globalThis.window.setTimeout(() => {
        if (!backgroundPaused || disposed) return;
        backgroundPaused = false;
        worker?.postMessage({ activity: false });
      }, 50);
    };
    scheduleRef.current = schedule;
    map.on("movestart", movementStarted);
    map.on("moveend", movementEnded);
    // Hosts without the shared callback retain the existing DOM projection path.
    let previousFallback: number[] = [];
    const scheduleFallback = () => {
      const { width, height, centerOffset } = map.transform;
      const focus = readCameraToCenterDistancePx(map);
      const ratio = globalThis.window.devicePixelRatio || 1;
      const values = [
        width,
        height,
        centerOffset.x,
        centerOffset.y,
        focus,
        ratio,
      ];
      if (values.every((value, index) => value === previousFallback[index]))
        return;
      previousFallback = values;
      const edge = 2 * focus * halfFovTan;
      const aspect = nativeSize.width / nativeSize.height;
      schedule({
        viewport: { width: width as CssPixels, height: height as CssPixels },
        image: {
          width: (aspect >= 1 ? edge : edge * aspect) as CssPixels,
          height: (aspect >= 1 ? edge / aspect : edge) as CssPixels,
        },
        offset: {
          x: centerOffset.x as CssPixels,
          y: centerOffset.y as CssPixels,
        },
        pixelRatio: ratio as Ratio,
      });
    };
    if (!sceneImage) {
      scheduleFallback();
      map.on("render", scheduleFallback);
      map.on("resize", scheduleFallback);
      globalThis.window.addEventListener("resize", scheduleFallback);
    }
    map.triggerRepaint();
    return () => {
      disposed = true;
      globalThis.window.clearTimeout(idleTimer);
      unsubscribeAvailability();
      cancel();
      // TIFF decoders retain their own block/WASM heaps; keep the display ROI, not that worker.
      if (
        worker &&
        (containsTiffDecoder ||
          publishedBackend === "tiff" ||
          (tiff && !currentRequestConfirmedAvif))
      ) {
        worker.terminate();
        worker = null;
        workerCanvasBytes = 0;
      }
      lease.bindWorker(worker);
      publishPoolState();
      lease.release();
      publishMemoryMetrics(imageId);
      worker = null;
      scheduleRef.current = null;
      contentRef.current = null;
      map.off("movestart", movementStarted);
      map.off("moveend", movementEnded);
      if (!sceneImage) {
        map.off("render", scheduleFallback);
        map.off("resize", scheduleFallback);
        globalThis.window.removeEventListener("resize", scheduleFallback);
      }
      setReady(false);
      canvas.width = canvas.height = 1;
      canvas.style.opacity = "0";
      map.triggerRepaint();
    };
  }, [
    map,
    rootRef,
    sourceIdentity,
    path,
    tiff,
    avifPyramidUrl,
    avifOnly,
    minimumQualityLevel,
    retainWholeImage,
    imageId,
    nativeSize.width,
    nativeSize.height,
    halfFovTan,
    principal.xOffset,
    principal.yOffset,
    rollDeg,
    dimImage,
    sceneImage,
  ]);
  useEffect(() => {
    map.triggerRepaint();
  }, [map, sourceUrl]);

  useEffect(() => {
    if (ready && !sceneImage && !dimImage)
      callbacksRef.current.onOutlineReady?.();
  }, [ready, sceneImage, dimImage]);

  const source = previewWindow?.source;
  return (
    <canvas
      ref={canvasRef}
      data-test-id="oblique-native-pixels"
      aria-label={`${imageId} Originalpixel`}
      style={{
        position: "absolute",
        pointerEvents: "none",
        opacity: ready && !sceneImage ? 1 : 0,
        left: `calc(50% + var(${PREVIEW_WIDTH_VAR},0px) * ${
          principal.xOffset - 0.5 + (source?.x ?? 0) / nativeSize.width
        })`,
        top: `calc(50% + var(${PREVIEW_HEIGHT_VAR},0px) * ${
          principal.yOffset - 0.5 + (source?.y ?? 0) / nativeSize.height
        })`,
        width: `calc(var(${PREVIEW_WIDTH_VAR},0px) * ${
          (source?.width ?? 0) / nativeSize.width
        })`,
        height: `calc(var(${PREVIEW_HEIGHT_VAR},0px) * ${
          (source?.height ?? 0) / nativeSize.height
        })`,
      }}
    />
  );
};
