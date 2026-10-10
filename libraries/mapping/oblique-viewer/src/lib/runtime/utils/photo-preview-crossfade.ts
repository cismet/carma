import type { Map as MaplibreMap } from "maplibre-gl";
import { Matrix3 } from "three";
import { ThreeImageLevels, type ImageView } from "@carma-commons/image-pyramid";
import {
  acquireSharedThreeScene,
  type MapStyleScreenOverlay,
} from "@carma-mapping/engines/maplibre";
import type { DevicePixels } from "@carma-units";
import { residentPreviewLevel } from "./preview-region-ready";
import { getCameraCalibration } from "../../core/utils/calibration";
import { nativePixelPool, nativePreviewSource } from "./native-preview-pool";
import {
  originalOf,
  pyramidOf,
  pyramidOptionsOf,
  type ObliqueViewportPhoto,
} from "./oblique-viewport-source";

type Options = {
  from: ObliqueViewportPhoto;
  to: ObliqueViewportPhoto;
  sourceView: ImageView;
  targetView: ImageView;
  /** Calibrated viewport-to-full-image mapping for the current animation frame. */
  sourceProjection: () => Matrix3;
  targetProjection: () => Matrix3;
  showBasemapLabels: boolean;
  decoration?: Pick<MapStyleScreenOverlay, "backdropLook" | "backdropTint">;
  signal?: AbortSignal;
};

export type PhotoPreviewCrossfade = {
  targetImageId: string;
  update: (progress: number) => void;
  finish: () => void;
  /** Call only when NativePixels displays the target, releasing both overlay slots. */
  reveal: () => void;
  dispose: () => void;
};

const UPDATE_INTERVAL_MS = 1000 / 30;
let nextId = 0;

/**
 * Freeze the source; progressively refine the target while blending flat previews.
 * Source-over blends their overlap linearly. Edges covered only by the source
 * stay opaque until finish; this simple transition does not crossfade those edges.
 */
export const createPhotoPreviewCrossfade = (
  map: MaplibreMap,
  options: Options
): PhotoPreviewCrossfade => {
  if (options.signal?.aborted)
    throw new DOMException("Preview transition aborted", "AbortError");
  const scene = acquireSharedThreeScene(map);
  const id = `oblique-preview-crossfade-${++nextId}`;
  const sourceId = `${id}-from`;
  const targetId = `${id}-to`;
  let disposeSource: (() => void) | undefined;
  let disposeTarget: (() => void) | undefined;
  let disposed = false;
  let finished = false;
  let stopTargetUpdates: (() => void) | undefined;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    options.signal?.removeEventListener("abort", dispose);
    stopTargetUpdates?.();
    stopTargetUpdates = undefined;
    scene.layer.setMapStyleScreenOverlay?.(sourceId, null);
    scene.layer.setMapStyleScreenOverlay?.(targetId, null);
    disposeSource?.();
    disposeSource = undefined;
    disposeTarget?.();
    disposeTarget = undefined;
    scene.release();
    map.triggerRepaint();
  };
  try {
    const renderer = scene.layer.getRenderer?.();
    if (!renderer || !scene.layer.setMapStyleScreenOverlay)
      throw Error("Die Vorschau kann noch nicht überblendet werden.");
    const snapshot = (
      photo: ObliqueViewportPhoto,
      view: ImageView,
      target: boolean
    ) => {
      const calibration = getCameraCalibration(
        photo.dataset,
        photo.record.cameraId
      );
      const nativeSize = {
        width: calibration.widthPx as DevicePixels,
        height: calibration.heightPx as DevicePixels,
      };
      const source = nativePreviewSource({
        imageId: photo.record.sourceId,
        path: photo.dataset.previewPath,
        sourceUrl: originalOf(photo) ?? pyramidOf(photo) ?? "",
        ...pyramidOptionsOf(photo),
        avifOnly: photo.dataset.avifOnly,
        nativeSize,
        minimumQualityLevel: photo.dataset.minimumPreviewQualityLevel,
      });
      const resident = nativePixelPool.peek(source);
      if (
        !resident?.pyramid ||
        !resident.plan ||
        !resident.metrics.decodedBytes
      )
        throw Error("Die Bildpixel für die Überblendung fehlen noch.");
      if (target && residentPreviewLevel(resident, view) === undefined)
        throw Error(
          "Für den Zielausschnitt fehlen noch durchgehende Bildpixel."
        );
      const lease = nativePixelPool.acquire(source);
      // NativePixels may render before the flight ends. Keep this temporary
      // composer separate so either owner can refine without changing the
      // other's ping-pong texture or crop before the actual reveal.
      const composer = new ThreeImageLevels();
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        composer.dispose();
        lease.release();
      };
      try {
        composer.attach(lease.stack);
        const { visible, density } = view;
        if (
          ![visible.x, visible.y, visible.width, visible.height, density].every(
            Number.isFinite
          ) ||
          visible.width <= 0 ||
          visible.height <= 0 ||
          density <= 0
        )
          throw Error("Der Bildausschnitt für die Überblendung ist ungültig.");
        const size = {
          width: Math.ceil(visible.width * density),
          height: Math.ceil(visible.height * density),
        };
        const result = composer.renderToTarget(renderer, visible, size);
        if (!result) throw Error("Die Vorschau ist noch nicht darstellbar.");
        if (!target) {
          // The frozen render target survives detaching; tile uploads and pool
          // pixels no longer need an extra owner for the outgoing photograph.
          composer.attach(null);
          lease.release();
        }
        const cropTransform = new Matrix3();
        const setCrop = (crop: typeof result.rect) =>
          cropTransform.set(
            nativeSize.width / crop.width,
            0,
            -crop.x / crop.width,
            0,
            nativeSize.height / crop.height,
            1 - (nativeSize.height - crop.y) / crop.height,
            0,
            0,
            1
          );
        setCrop(result.rect);
        let revision = result.revision;
        const pixels = {
          texture: result.texture,
          cropTransform,
          matrix: new Matrix3(),
          release,
          onContentChange: (callback: () => void) =>
            lease.stack.onContentChange(callback),
          recompose: () => {
            if (
              released ||
              residentPreviewLevel(lease.stack, view) === undefined
            )
              return false;
            const next = composer.renderToTarget(renderer, visible, size);
            if (!next || next.revision === revision) return false;
            pixels.texture = next.texture;
            setCrop(next.rect);
            revision = next.revision;
            return true;
          },
        };
        return pixels;
      } catch (error) {
        release();
        throw error;
      }
    };
    const source = snapshot(options.from, options.sourceView, false);
    disposeSource = source.release;
    const target = snapshot(options.to, options.targetView, true);
    disposeTarget = target.release;
    let currentProgress: number | undefined;
    const update = (progress: number) => {
      if (disposed || !Number.isFinite(progress)) return;
      const amount = finished ? 1 : Math.max(0, Math.min(1, progress));
      currentProgress = amount;
      if (!finished) {
        source.matrix
          .copy(source.cropTransform)
          .multiply(options.sourceProjection());
        scene.layer.setMapStyleScreenOverlay?.(sourceId, {
          texture: source.texture,
          viewportToTexture: source.matrix,
          opacity: 1,
          priority: 119,
          ...options.decoration,
          backdropOpacity: 1,
          showBasemapLabels: options.showBasemapLabels,
        });
      }
      target.matrix
        .copy(target.cropTransform)
        .multiply(options.targetProjection());
      scene.layer.setMapStyleScreenOverlay?.(targetId, {
        texture: target.texture,
        viewportToTexture: target.matrix,
        // Flat slots use source-over: keep the source opaque to obtain a
        // linear crossfade without revealing the scene through the overlap.
        opacity: amount,
        priority: 120,
        ...options.decoration,
        backdropOpacity: 1,
        showBasemapLabels: options.showBasemapLabels,
      });
      map.triggerRepaint();
    };
    let updateTimer: ReturnType<typeof setTimeout> | undefined;
    let lastCompositionAt = performance.now();
    const unsubscribe = target.onContentChange(() => {
      if (disposed || updateTimer !== undefined) return;
      // Tile events coalesce outside the map render callback. Flight updates
      // only change matrices/opacity; they never upload or compose pixels.
      const delay = Math.max(
        0,
        Math.ceil(UPDATE_INTERVAL_MS - (performance.now() - lastCompositionAt))
      );
      updateTimer = setTimeout(() => {
        updateTimer = undefined;
        if (disposed) return;
        lastCompositionAt = performance.now();
        try {
          if (target.recompose() && currentProgress !== undefined)
            update(currentProgress);
        } catch {
          // The live preview can resume if this temporary renderer is lost.
          dispose();
        }
      }, delay);
    });
    stopTargetUpdates = () => {
      clearTimeout(updateTimer);
      updateTimer = undefined;
      unsubscribe();
    };
    options.signal?.addEventListener("abort", dispose, { once: true });
    if (options.signal?.aborted) {
      dispose();
      throw new DOMException("Preview transition aborted", "AbortError");
    }
    return {
      targetImageId: options.to.record.id,
      update,
      finish: () => {
        if (disposed) return;
        finished = true;
        update(1);
        scene.layer.setMapStyleScreenOverlay?.(sourceId, null);
        disposeSource?.();
        disposeSource = undefined;
      },
      reveal: dispose,
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
};
