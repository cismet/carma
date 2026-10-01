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
  nativePreviewTiles,
  type NativePreviewWindow,
} from "../core/utils/native-preview-window";
import { useScenePreviewImage } from "./hooks/useScenePreviewImage";
import { readCameraToCenterDistancePx } from "./utils/cameraMath";
import {
  PREVIEW_HEIGHT_VAR,
  PREVIEW_WIDTH_VAR,
} from "./hooks/usePreviewSizeSync";

/** Keep source-size TIFF decoding remote; resample bounded, lossless RGB tiles in a browser worker. */
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
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [window, setWindow] = useState<NativePreviewWindow | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !rootRef.current || dimImage) return undefined;
    let timer: number | undefined,
      controller: AbortController | null = null,
      worker: Worker | null = null;
    let key = "",
      disposed = false,
      generation = 0;
    const schedule = () => {
      const { width, height, centerOffset } = map.transform;
      const edge = 2 * readCameraToCenterDistancePx(map) * halfFovTan;
      const aspect = nativeSize.width / nativeSize.height;
      const image = {
        width: (aspect >= 1 ? edge : edge * aspect) as CssPixels,
        height: (aspect >= 1 ? edge / aspect : edge) as CssPixels,
      };
      const frame = nativePreviewWindow(
        { width: width as CssPixels, height: height as CssPixels },
        image,
        nativeSize,
        { x: centerOffset.x as CssPixels, y: centerOffset.y as CssPixels },
        principal,
        degToRad(rollDeg as Degrees),
        (globalThis.window.devicePixelRatio || 1) as Ratio
      );
      // Include projection scale as well as crop: an unchanged source window may need a new DPR.
      const next = JSON.stringify({ frame, image });
      if (next === key) return;
      key = next;
      generation++;
      globalThis.window.clearTimeout(timer);
      controller?.abort();
      worker?.terminate();
      worker = null;
      setReady(false);
      canvas.style.opacity = "0";
      if (!frame) return;
      const epoch = generation;
      timer = globalThis.window.setTimeout(() => {
        if (disposed || epoch !== generation) return;
        controller = new AbortController();
        const signal = controller.signal;
        worker = new Worker(
          new URL("./utils/preview-rgb.worker.ts", import.meta.url),
          { type: "module" }
        );
        const currentWorker = worker;
        canvas.width = frame.target.width;
        canvas.height = frame.target.height;
        const context = canvas.getContext("2d");
        if (!context) {
          currentWorker.terminate();
          return;
        }
        setWindow(frame);
        const run = async () => {
          for (const tile of nativePreviewTiles(frame, nativeSize)) {
            if (signal.aborted || disposed || epoch !== generation) return;
            const url = new URL(
              `${path.replace(/\/$/, "")}/${encodeURIComponent(imageId)}.png`,
              globalThis.window.location.href
            );
            Object.entries({ ...tile.source, edge: tile.edge }).forEach(
              ([name, value]) => url.searchParams.set(name, String(value))
            );
            const response = await fetch(url, { signal });
            if (!response.ok)
              throw new Error(`Native RGB preview: ${response.status}`);
            const bitmap = await createImageBitmap(await response.blob());
            if (signal.aborted || disposed || epoch !== generation) {
              bitmap.close();
              return;
            }
            const scaleX = bitmap.width / tile.source.width,
              scaleY = bitmap.height / tile.source.height;
            const message = {
              bitmap,
              sourceWidth: bitmap.width,
              sourceHeight: bitmap.height,
              width: tile.target.width,
              height: tile.target.height,
              sample: {
                x: (tile.sample.x - tile.source.x) * scaleX,
                y: (tile.sample.y - tile.source.y) * scaleY,
                width: tile.sample.width * scaleX,
                height: tile.sample.height * scaleY,
              },
            };
            const output = await new Promise<ArrayBuffer>((resolve, reject) => {
              let settled = false;
              const finish = (error?: Error, pixels?: ArrayBuffer) => {
                if (settled) return;
                settled = true;
                globalThis.window.clearTimeout(timeout);
                signal.removeEventListener("abort", abort);
                currentWorker.onmessage = null;
                currentWorker.onerror = null;
                currentWorker.onmessageerror = null;
                if (error) reject(error);
                else if (pixels) resolve(pixels);
                else reject(new Error("No RGB pixels"));
              };
              const abort = () => finish(new Error("RGB resampling cancelled"));
              const timeout = globalThis.window.setTimeout(
                () => finish(new Error("RGB resampling timed out")),
                30000
              );
              signal.addEventListener("abort", abort, { once: true });
              currentWorker.onmessage = (
                event: MessageEvent<{ pixels?: ArrayBuffer; error?: string }>
              ) => {
                if (event.data.error || !event.data.pixels)
                  finish(new Error(event.data.error || "No RGB pixels"));
                else finish(undefined, event.data.pixels);
              };
              currentWorker.onerror = () =>
                finish(new Error("RGB resampling worker failed"));
              currentWorker.onmessageerror = () =>
                finish(new Error("RGB resampling response failed"));
              try {
                currentWorker.postMessage(message, [bitmap]);
              } catch (error) {
                bitmap.close();
                finish(
                  error instanceof Error ? error : new Error(String(error))
                );
              }
            });
            if (signal.aborted || disposed || epoch !== generation) return;
            context.putImageData(
              new ImageData(
                new Uint8ClampedArray(output),
                tile.target.width,
                tile.target.height
              ),
              tile.target.x,
              tile.target.y
            );
            setReady(true);
            setRevision((value) => value + 1);
          }
        };
        void run()
          .catch((error: unknown) => {
            // A missing original or unavailable renderer keeps the decoded progressive image.
            if (import.meta.env.DEV && !signal.aborted)
              console.warn("Native RGB preview unavailable", error);
          })
          .finally(() => {
            currentWorker.terminate();
            if (worker === currentWorker) worker = null;
          });
      }, 800);
    };
    schedule();
    map.on("render", schedule);
    map.on("resize", schedule);
    globalThis.window.addEventListener("resize", schedule);
    return () => {
      disposed = true;
      generation++;
      globalThis.window.clearTimeout(timer);
      controller?.abort();
      worker?.terminate();
      map.off("render", schedule);
      map.off("resize", schedule);
      globalThis.window.removeEventListener("resize", schedule);
      setReady(false);
      canvas.style.opacity = "0";
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
  ]);
  const sceneImage = useScenePreviewImage({
    map,
    source: canvasRef.current,
    revision,
    shown: ready && !dimImage,
    halfFovTan,
    nativeSize,
    principal,
    rollDeg,
    crop: window?.source,
    priority: 1,
  });
  const source = window?.source;
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
