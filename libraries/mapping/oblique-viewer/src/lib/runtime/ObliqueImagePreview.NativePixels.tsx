/// <reference types="vite/client" />
import { useEffect, useRef, useState, type RefObject } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import type { WebGLRenderer } from "three";
import {
  degToRad,
  type CssPixels,
  type Degrees,
  type DevicePixels,
  type Ratio,
} from "@carma-units";
import {
  drawImageLevels,
  nativePreviewWindow,
  ThreeImageLevels,
  tileRangeFor,
  type ImageLevelStack,
  type ImageRect,
  type NativePreviewWindow,
} from "@carma-commons/image-streaming";
import type { PreviewQualityLevel } from "../core/constants";
import type { ObliqueBackdropLook } from "../core/types";
import {
  useScenePreviewImage,
  type ScenePreviewImageContent,
  type ScenePreviewImageGeometry,
  type ScenePreviewPhoto,
} from "./hooks/useScenePreviewImage";
import {
  PREVIEW_HEIGHT_VAR,
  PREVIEW_WIDTH_VAR,
} from "./hooks/usePreviewSizeSync";
import { readCameraToCenterDistancePx } from "./utils/cameraMath";
import { getPreviewImageUrl } from "./utils/imageUrls";
import { nativePixelPool, nativePreviewSource, rememberNativePreviewView, lastNativePreviewView } from "./utils/native-preview-pool";
import type { PreviewBackdropTint } from "./utils/preview-backdrop";
import {
  isPreviewSourceMissing,
  reportPreviewSourceAvailable,
  reportPreviewSourceMissing,
} from "./utils/preview-thumbnail-cache";

type PreviewMemorySnapshot = {
  imageId: string;
  viewportPixels: number;
  imageBytes: number;
  imageBudgetBytes: number;
  sourceResidentBytes: number;
  workerResidentBytes: number;
  estimatedGpuBytes: number;
  poolInstances: number;
  poolBytes: number;
  poolBudgetBytes: number;
};

/** Slack around the pinhole crop so the calibrated homography never samples outside. */
const CROP_MARGIN = 0.08;

const publishMemoryMetrics = (
  imageId: string,
  stack: ImageLevelStack,
  viewportPixels: number
) => {
  const pool = nativePixelPool.metrics;
  const metrics = stack.metrics;
  globalThis.window.dispatchEvent(
    new CustomEvent<PreviewMemorySnapshot>("carma-oblique-preview-memory", {
      detail: {
        imageId,
        viewportPixels,
        imageBytes: metrics.decodedBytes,
        imageBudgetBytes: metrics.budgetBytes,
        sourceResidentBytes: metrics.compressedBytes,
        workerResidentBytes: 0,
        // Tile textures mirror decoded tiles; the two render targets hold the composite.
        estimatedGpuBytes: metrics.decodedBytes + 2 * viewportPixels * 4,
        poolInstances: pool.images.length,
        poolBytes: pool.decodedBytes,
        poolBudgetBytes: pool.images.reduce(
          (sum, image) => sum + image.budgetBytes,
          0
        ),
      },
    })
  );
};

const expandWindow = (
  window: NativePreviewWindow,
  native: { width: number; height: number }
) => {
  const { source, target } = window;
  const dx = source.width * CROP_MARGIN,
    dy = source.height * CROP_MARGIN;
  const x0 = Math.max(0, source.x - dx),
    y0 = Math.max(0, source.y - dy);
  const x1 = Math.min(native.width, source.x + source.width + dx),
    y1 = Math.min(native.height, source.y + source.height + dy);
  const density = target.width / source.width;
  return {
    rect: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } as ImageRect,
    size: {
      width: Math.ceil((x1 - x0) * density),
      height: Math.ceil((y1 - y0) * density),
    },
    density,
  };
};

/**
 * Native photo pixels for the oblique preview. Each map frame composes the
 * resident pyramid tiles for the current camera into a render target before
 * the scene samples it, so image and camera can never drift apart.
 */
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
  featherPx = 0,
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
  /** TIFF originals are download-only; the preview streams the JPEG family instead. */
  tiff?: boolean;
  avifPyramidUrl?: string;
  avifOnly?: boolean;
  minimumQualityLevel?: PreviewQualityLevel;
  /** Fade tile edges whose same-level neighbor is still loading, in physical pixels. */
  featherPx?: number;
  onSourceLoaded?: (url: string, width: number, height: number) => void;
  /** Ownership of the bounded whole-image bitmap transfers to this callback. */
  onFullImage?: (bitmap: ImageBitmap) => void;
  retainWholeImage?: boolean;
  onError?: (
    imageId: string,
    details?: { message: string; missing: boolean }
  ) => void;
  onOutlineReady?: () => void;
  /** Target-level tiles cover the visible photo at physical display density. */
  onDisplayReady?: () => void;
  backdropLook?: ObliqueBackdropLook;
  backdropTint?: PreviewBackdropTint;
  showBasemapLabels?: boolean;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<ScenePreviewImageContent | null>(null);
  const scheduleRef = useRef<
    | ((
        geometry: ScenePreviewImageGeometry,
        renderer: WebGLRenderer | null
      ) => void)
    | null
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
  const [domWindow, setDomWindow] = useState<NativePreviewWindow | null>(null);
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
    onBeforeRender: (geometry, renderer) =>
      scheduleRef.current?.(geometry, renderer),
  });
  const jpegUrl =
    !avifOnly && !avifPyramidUrl && (tiff || !sourceUrl)
      ? getPreviewImageUrl(path ?? "", minimumQualityLevel, imageId)
      : sourceUrl;

  const dimRef = useRef(dimImage);
  dimRef.current = dimImage;
  useEffect(() => {
    map.triggerRepaint();
  }, [map, dimImage]);

  useEffect(() => {
    if (!rootRef.current) return undefined;
    const availability = {
      previewPath: path ?? "",
      imageId,
      originalImageUrl: tiff ? sourceUrl : undefined,
      avifPyramidUrl,
      avifOnly,
      nativeSize,
    };
    if (isPreviewSourceMissing(availability)) {
      callbacksRef.current.onError?.(imageId, {
        message: "Preview source unavailable (cached 404/410)",
        missing: true,
      });
      return undefined;
    }
    const source = nativePreviewSource({ imageId, path, sourceUrl: jpegUrl,
      avifPyramidUrl, avifOnly, nativeSize, minimumQualityLevel });
    const { stack, release } = nativePixelPool.acquire(source);
    const prepared = lastNativePreviewView(source);
    if (dimRef.current && prepared) stack.setView(prepared.view, prepared.pixels);

    const composer = new ThreeImageLevels();
    composer.featherPx = featherPx;
    composer.attach(stack);
    let disposed = false;
    let displayReady = false;
    let fullImageSent = !retainWholeImage;
    let lastDensity = 0;
    let intent: "in" | "out" | null = null;
    let intentTimer: ReturnType<typeof setTimeout> | undefined;
    let viewportPixels = 0;
    let metricsAt = 0;

    const sendFullImage = () => {
      const pyramid = stack.pyramid,
        plan = stack.plan;
      if (fullImageSent || !pyramid || plan?.floor == null) return;
      const floor = pyramid.levels.find((level) => level.level === plan.floor)!;
      for (let row = 0; row < floor.rows; row++)
        for (let col = 0; col < floor.cols; col++)
          if (!stack.isResident(floor.level, col, row)) return;
      fullImageSent = true;
      const canvas = new OffscreenCanvas(floor.width, floor.height);
      const context = canvas.getContext("2d")!;
      drawImageLevels(
        context,
        stack,
        { originX: 0, originY: 0, scale: floor.width / pyramid.native.width },
        canvas
      );
      callbacksRef.current.onFullImage?.(canvas.transferToImageBitmap());
    };
    const checkReady = (rect: ImageRect) => {
      const pyramid = stack.pyramid,
        plan = stack.plan;
      if (!pyramid || !plan) return;
      const level = pyramid.levels.find(
        (candidate) => candidate.level === plan.target
      )!;
      const range = tileRangeFor(level, pyramid.native, rect);
      let ready = true;
      for (let row = range.row0; ready && row < range.row1; row++)
        for (let col = range.col0; ready && col < range.col1; col++)
          ready = stack.isResident(level.level, col, row);
      if (ready && !displayReady) callbacksRef.current.onDisplayReady?.();
      displayReady = ready;
    };

    const schedule = (
      geometry: ScenePreviewImageGeometry,
      renderer: WebGLRenderer | null
    ) => {
      // A dimmed flight still decodes its prepared view; moving scene geometry is not its final crop.
      if (disposed || dimRef.current) return;
      const window = nativePreviewWindow(
        geometry.viewport,
        geometry.image,
        nativeSize,
        geometry.offset,
        principal,
        degToRad(rollDeg as Degrees),
        geometry.pixelRatio
      );
      if (!window) {
        contentRef.current = null;
        return;
      }
      const { rect, size, density } = expandWindow(window, nativeSize);
      if (lastDensity && Math.abs(density / lastDensity - 1) > 1e-3) {
        intent = density > lastDensity ? "in" : "out";
        clearTimeout(intentTimer);
        intentTimer = setTimeout(() => {
          intent = null;
          map.triggerRepaint();
        }, 400);
      }
      lastDensity = density;
      viewportPixels =
        Math.ceil(geometry.viewport.width * geometry.pixelRatio) *
        Math.ceil(geometry.viewport.height * geometry.pixelRatio);
      const view = { visible: window.source, density: density as Ratio };
      rememberNativePreviewView(source, view, viewportPixels);
      stack.setView(
        view,
        viewportPixels,
        intent
      );
      if (renderer) {
        const result = composer.renderToTarget(renderer, rect, size);
        contentRef.current = result
          ? {
              texture: result.texture,
              crop: result.rect,
              revision: result.revision,
            }
          : null;
      } else {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (canvas && context) {
          if (canvas.width !== size.width) canvas.width = size.width;
          if (canvas.height !== size.height) canvas.height = size.height;
          drawImageLevels(
            context,
            stack,
            { originX: rect.x, originY: rect.y, scale: density },
            size,
            { featherPx }
          );
          // React renders only when the positioned crop actually changes.
          setDomWindow((previous) =>
            previous &&
            previous.source.x === rect.x &&
            previous.source.y === rect.y &&
            previous.source.width === rect.width &&
            previous.source.height === rect.height
              ? previous
              : { source: rect, target: size as NativePreviewWindow["target"] }
          );
        }
      }
      checkReady(window.source);
      sendFullImage();
      if (performance.now() - metricsAt > 250) {
        metricsAt = performance.now();
        publishMemoryMetrics(imageId, stack, viewportPixels);
      }
    };
    scheduleRef.current = schedule;
    const unsubscribe = stack.onContentChange(() => map.triggerRepaint());
    stack.ready.then(
      (pyramid) => {
        if (disposed) return;
        reportPreviewSourceAvailable(availability);
        callbacksRef.current.onSourceLoaded?.(
          source.url,
          pyramid.native.width,
          pyramid.native.height
        );
        map.triggerRepaint();
      },
      (error) => {
        if (disposed) return;
        const message = error instanceof Error ? error.message : String(error);
        const missing = /\b(404|410)\b/.test(message);
        if (missing) reportPreviewSourceMissing(availability);
        callbacksRef.current.onError?.(imageId, { message, missing });
        if (import.meta.env.DEV)
          console.warn("Native preview pixels unavailable", message);
      }
    );
    // Hosts without the shared scene draw the same tiles into a positioned canvas.
    let fallbackKey = "";
    const scheduleFallback = () => {
      const { width, height, centerOffset } = map.transform;
      const focus = readCameraToCenterDistancePx(map);
      const ratio = globalThis.window.devicePixelRatio || 1;
      const key = [
        width,
        height,
        centerOffset.x,
        centerOffset.y,
        focus,
        ratio,
      ].join();
      if (key === fallbackKey && !stack.plan) return;
      fallbackKey = key;
      const edge = 2 * focus * halfFovTan;
      const aspect = nativeSize.width / nativeSize.height;
      schedule(
        {
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
        },
        null
      );
    };
    if (!sceneImage) {
      map.on("render", scheduleFallback);
      map.on("resize", scheduleFallback);
    }
    map.triggerRepaint();
    return () => {
      disposed = true;
      clearTimeout(intentTimer);
      unsubscribe();
      scheduleRef.current = null;
      contentRef.current = null;
      if (!sceneImage) {
        map.off("render", scheduleFallback);
        map.off("resize", scheduleFallback);
      }
      composer.dispose();
      release();
      setDomWindow(null);
      map.triggerRepaint();
    };
  }, [
    map,
    rootRef,
    jpegUrl,
    sourceUrl,
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
    sceneImage,
    featherPx,
    path,
    tiff,
  ]);

  useEffect(() => {
    if (domWindow && !sceneImage && !dimImage)
      callbacksRef.current.onOutlineReady?.();
  }, [domWindow, sceneImage, dimImage]);

  const source = domWindow?.source;
  return (
    <canvas
      ref={canvasRef}
      data-test-id="oblique-native-pixels"
      aria-label={`${imageId} Originalpixel`}
      style={{
        position: "absolute",
        pointerEvents: "none",
        opacity: domWindow && !sceneImage ? 1 : 0,
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
