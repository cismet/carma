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
} from "./hooks/useScenePreviewImage";
import { readCameraToCenterDistancePx } from "./utils/cameraMath";
import {
  PREVIEW_HEIGHT_VAR,
  PREVIEW_WIDTH_VAR,
} from "./hooks/usePreviewSizeSync";

/** Fetch, decode and assemble native RGB in a cancellable worker after the camera rests. */
export const NativePixels = ({
  map,
  rootRef,
  path,
  imageId,
  nativeSize,
  halfFovTan,
  principal,
  rollDeg,
  dimImage,
}: {
  map: MaplibreMap;
  rootRef: RefObject<HTMLElement>;
  path: string;
  imageId: string;
  nativeSize: { width: DevicePixels; height: DevicePixels };
  halfFovTan: number;
  principal: { xOffset: number; yOffset: number };
  rollDeg: number;
  dimImage: boolean;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<ScenePreviewImageContent | null>(null);
  const scheduleRef = useRef<
    ((geometry: ScenePreviewImageGeometry) => void) | null
  >(null);
  // These states serve only the DOM fallback. Shared-scene publication is synchronous.
  const [ready, setReady] = useState(false);
  const [previewWindow, setPreviewWindow] =
    useState<NativePreviewWindow | null>(null);
  const sceneImage = useScenePreviewImage({
    map,
    contentRef,
    shown: !dimImage,
    halfFovTan,
    nativeSize,
    principal,
    rollDeg,
    priority: 1,
    onBeforeRender: (geometry) => scheduleRef.current?.(geometry),
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !rootRef.current || dimImage) return undefined;
    let timer: number | undefined;
    let timeout: number | undefined;
    let worker: Worker | null = null;
    let published: ImageBitmap | null = null;
    let previousGeometry: ScenePreviewImageGeometry | null = null;
    let disposed = false;
    let generation = 0;
    const url = new URL(
      `${path.replace(/\/$/, "")}/${encodeURIComponent(imageId)}.png`,
      globalThis.window.location.href
    ).href;
    const cancel = () => {
      generation++;
      globalThis.window.clearTimeout(timer);
      globalThis.window.clearTimeout(timeout);
      worker?.terminate();
      worker = null;
    };
    const schedule = (geometry: ScenePreviewImageGeometry) => {
      if (disposed || geometry === previousGeometry) return;
      previousGeometry = geometry;
      cancel();
      const frame = nativePreviewWindow(
        geometry.viewport,
        geometry.image,
        nativeSize,
        geometry.offset,
        principal,
        degToRad(rollDeg as Degrees),
        geometry.pixelRatio
      );
      if (!frame) return;
      const epoch = generation;
      const start = () => {
        if (disposed || epoch !== generation) return;
        if (map.isMoving?.()) {
          timer = globalThis.window.setTimeout(start, 800);
          return;
        }
        let currentWorker: Worker;
        try {
          currentWorker = new Worker(
            new URL("./utils/preview-rgb.worker.ts", import.meta.url),
            { type: "module" }
          );
        } catch {
          return;
        }
        worker = currentWorker;
        let jobTimeout: number | undefined;
        const finish = (error?: string) => {
          globalThis.window.clearTimeout(jobTimeout);
          currentWorker.terminate();
          if (worker === currentWorker) worker = null;
          if (error && !disposed && epoch === generation && import.meta.env.DEV)
            console.warn("Native RGB preview unavailable", error);
        };
        currentWorker.onmessage = (
          event: MessageEvent<{ bitmap?: ImageBitmap; error?: string }>
        ) => {
          const bitmap = event.data.bitmap;
          if (disposed || epoch !== generation) {
            bitmap?.close();
            finish();
            return;
          }
          if (!bitmap || event.data.error) {
            bitmap?.close();
            finish(event.data.error || "No RGB bitmap");
            return;
          }
          if (sceneImage) {
            const previous = published;
            published = bitmap;
            contentRef.current = { source: bitmap, crop: frame.source };
            previous?.close();
            map.triggerRepaint();
          } else {
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const context = canvas.getContext("2d");
            if (context) {
              context.drawImage(bitmap, 0, 0);
              setPreviewWindow(frame);
              setReady(true);
            }
            bitmap.close();
          }
          finish();
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
          currentWorker.postMessage({
            url,
            window: frame,
            nativeSize,
            flipForTexture: sceneImage,
          });
        } catch {
          finish("RGB request transfer failed");
        }
      };
      timer = globalThis.window.setTimeout(start, 800);
    };
    const movementStarted = () => {
      cancel();
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
      cancel();
      scheduleRef.current = null;
      contentRef.current = null;
      published?.close();
      map.off("movestart", movementStarted);
      if (!sceneImage) {
        map.off("render", scheduleFallback);
        map.off("resize", scheduleFallback);
        globalThis.window.removeEventListener("resize", scheduleFallback);
      }
      setReady(false);
      canvas.style.opacity = "0";
      map.triggerRepaint();
    };
  }, [
    map,
    rootRef,
    path,
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
