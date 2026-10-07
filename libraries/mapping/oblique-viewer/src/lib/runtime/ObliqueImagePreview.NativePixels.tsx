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
  nativePreviewWindow,
  type NativePreviewWindow,
} from "../core/utils/native-preview-window";
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

type ParkedComposition = {
  worker: Worker | null;
  bitmap: ImageBitmap | null;
  frame: NativePreviewWindow | null;
  density: number;
  complete: boolean;
  sourceWidth?: number;
  sourceHeight?: number;
  backend?: string;
  bytes: number;
  sourceResidentBytes?: number;
};
const parkedCompositions = new Map<string, ParkedComposition>();
const activeCompositionBytes = new Map<symbol, number>();
let poolDisposed = false;
import.meta.hot?.dispose(() => {
  poolDisposed = true;
  for (const entry of parkedCompositions.values()) {
    entry.worker?.terminate();
    entry.bitmap?.close();
  }
  parkedCompositions.clear();
  activeCompositionBytes.clear();
});
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
const trimParkedCompositions = () => {
  const policy = retentionPolicy();
  let bytes =
    [...activeCompositionBytes.values()].reduce((sum, size) => sum + size, 0) +
    [...parkedCompositions.values()].reduce(
      (sum, entry) => sum + entry.bytes,
      0
    );
  while (
    (parkedCompositions.size + activeCompositionBytes.size > policy.maxCount ||
      bytes > policy.byteLimit) &&
    parkedCompositions.size
  ) {
    const key = parkedCompositions.keys().next().value!;
    const entry = parkedCompositions.get(key)!;
    entry.worker?.terminate();
    entry.bitmap?.close();
    bytes -= entry.bytes;
    parkedCompositions.delete(key);
  }
};
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
const ACTIVE_SOURCE_BYTE_LIMIT = 768 * 1024 * 1024;
const MAX_FULL_IMAGE_PIXELS = 4 * 1024 * 1024;
let compositionGeneration = 0;

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
  onError,
  backdropLook,
  backdropTint,
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
  backdropLook?: ObliqueBackdropLook;
  backdropTint?: PreviewBackdropTint;
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
  });
  callbacksRef.current = {
    onSourceLoaded,
    onFullImage,
    onError,
    onOutlineReady,
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
    let publishedFrame: NativePreviewWindow | null = null;
    let publishedComplete = false;
    let publishedDensity = 0;
    let publishedBackend: string | undefined;
    let containsTiffDecoder = false;
    let currentRequestConfirmedAvif = false;
    let publishedSourceSize: { width?: number; height?: number } = {};
    let workerCanvasBytes = 0;
    const activeToken = Symbol(imageId);
    let previousGeometry: ScenePreviewImageGeometry | null = null;
    let started = false;
    let disposed = false;
    let generation = ++compositionGeneration;
    const retainedSourceByteLimit = retentionPolicy().sourceBytes;
    const activeSourceByteLimit = retainWholeImage
      ? ACTIVE_SOURCE_BYTE_LIMIT
      : retainedSourceByteLimit;
    const photoSourceIdentity = new URL(
      avifPyramidUrl ?? sourceIdentity,
      globalThis.window.location.href
    ).href;
    let sourceResidentBytes = retainedSourceByteLimit;
    let fullImageBytes = 0;
    const workerKey = `${path ?? ""}/${
      new URL(sourceIdentity, globalThis.window.location.href).href
    }/${imageId}/${tiff}/${avifPyramidUrl ?? ""}/${nativeSize.width}x${
      nativeSize.height
    }/${sceneImage}/${avifOnly}`;
    const retained = parkedCompositions.get(workerKey);
    worker = retained?.worker ?? null;
    sourceResidentBytes =
      retained?.sourceResidentBytes ?? retainedSourceByteLimit;
    parkedCompositions.delete(workerKey);
    const accountActive = () => {
      activeCompositionBytes.set(
        activeToken,
        rasterBytes(published) +
          fullImageBytes +
          (!sceneImage && published ? rasterBytes(canvas) : 0) +
          (worker ? workerCanvasBytes + sourceResidentBytes : 0)
      );
      trimParkedCompositions();
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
        (!retainWholeImage || started)
      ) {
        // Existing pixels stay aligned by the shared-frame matrix; no RPC or upload.
        globalThis.window.clearTimeout(timer);
        timer = undefined;
        return;
      }
      cancel();
      if (!frame) return;
      const epoch = generation;
      const start = () => {
        if (disposed || epoch !== generation) return;
        if (map.isMoving?.()) {
          timer = globalThis.window.setTimeout(start, 200);
          return;
        }
        const missingSource = availabilitySource;
        if (isPreviewSourceMissing(missingSource)) {
          awaitingAvailability = true;
          callbacksRef.current.onError?.(imageId, {
            message: "Preview source unavailable (cached 404/410)",
            missing: true,
          });
          return;
        }
        let currentWorker: Worker;
        try {
          currentWorker =
            worker ??
            new Worker(
              new URL("./utils/preview-rgb.worker.ts", import.meta.url),
              { type: "module" }
            );
        } catch {
          return;
        }
        worker = currentWorker;
        currentRequestConfirmedAvif = false;
        started = true;
        accountActive();
        let jobTimeout: number | undefined;
        const finish = (error?: string, missing = false, completed = false) => {
          globalThis.window.clearTimeout(jobTimeout);
          if (error || completed) foregroundInFlight = false;
          if (error) {
            currentWorker.terminate();
            if (worker === currentWorker) worker = null;
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
            kind?: "full-image" | "source-memory";
            imageId?: string;
            sourceIdentity?: string;
            sourceUrl?: string;
            sourceResidentBytes?: number;
            reusePublished?: boolean;
          }>
        ) => {
          const bitmap = event.data.bitmap;
          const updateResidentBytes = () => {
            const bytes = event.data.sourceResidentBytes;
            if (bytes !== undefined && Number.isFinite(bytes) && bytes >= 0) {
              sourceResidentBytes = bytes;
              accountActive();
            }
          };
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
          const density =
            event.data.sampleDensity ??
            Math.min(
              (event.data.sourceWidth ?? nativeSize.width) / nativeSize.width,
              (event.data.sourceHeight ?? nativeSize.height) /
                nativeSize.height,
              bitmap.width / crop.width,
              bitmap.height / crop.height
            );
          if (
            published &&
            publishedFrame &&
            cropCovers(
              publishedFrame.source,
              frame.source,
              publishedFrame.target
            ) &&
            density < publishedDensity
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
          const previous = published;
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
          previous?.close();
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
          finish(undefined, false, event.data.complete !== false);
        };
        currentWorker.onerror = () => finish("RGB worker failed");
        currentWorker.onmessageerror = () =>
          finish("RGB bitmap transfer failed");
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
            imageId,
            sourceIdentity: photoSourceIdentity,
            reusePublished: !!published,
          });
        } catch {
          finish("RGB request transfer failed");
        }
      };
      if (!started && !map.isMoving?.()) start();
      else timer = globalThis.window.setTimeout(start, 200);
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
    const movementStarted = () => {
      // The next shared frame cancels only a crop that actually needs new pixels.
      previousGeometry = null;
      previousFallback = [];
    };
    scheduleRef.current = schedule;
    map.on("movestart", movementStarted);
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
      unsubscribeAvailability();
      cancel();
      const keepBitmap = published;
      if (!keepBitmap) published?.close();
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
      if (worker) {
        worker.onmessage = (event: MessageEvent<{ bitmap?: ImageBitmap }>) =>
          event.data.bitmap?.close();
        worker.onerror = null;
        worker.onmessageerror = null;
        worker.postMessage({
          cancel: true,
          park: true,
          retainedSourceByteLimit,
        });
      }
      const old = parkedCompositions.get(workerKey);
      old?.worker?.terminate();
      old?.bitmap?.close();
      parkedCompositions.delete(workerKey);
      activeCompositionBytes.delete(activeToken);
      if (!poolDisposed && (worker || keepBitmap))
        parkedCompositions.set(workerKey, {
          worker,
          bitmap: keepBitmap,
          frame: keepBitmap ? publishedFrame : null,
          density: publishedDensity,
          complete: publishedComplete,
          sourceWidth: publishedSourceSize.width,
          sourceHeight: publishedSourceSize.height,
          backend: publishedBackend,
          sourceResidentBytes: Math.min(
            sourceResidentBytes,
            retainedSourceByteLimit
          ),
          bytes:
            rasterBytes(keepBitmap) +
            (worker
              ? workerCanvasBytes +
                Math.min(sourceResidentBytes, retainedSourceByteLimit)
              : 0),
        });
      if (poolDisposed) {
        worker?.terminate();
        keepBitmap?.close();
      }
      trimParkedCompositions();
      worker = null;
      scheduleRef.current = null;
      contentRef.current = null;
      map.off("movestart", movementStarted);
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
