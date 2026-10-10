import type { ImageView } from "@carma-commons/image-pyramid";
import { MercatorCoordinate, type Map as MaplibreMap } from "maplibre-gl";
import { Matrix4 } from "three";
import { getCameraLocalMercatorFit } from "@carma-geo/proj";
import type { ObliquePose } from "../../core/types";
import {
  imageProjectionMatrix,
  sceneToPhotoEnu,
  viewportImageProjection,
} from "../../core/utils/image-projection";
import { projectedNativePreviewWindow } from "../../core/utils/native-preview-window";
import { presentationPointToScene } from "../../core/utils/photo-center-rays";
import { residentPreviewLevel } from "./preview-region-ready";
import {
  acquireForegroundNetwork,
  acquireSharedThreeScene,
} from "@carma-mapping/engines/maplibre";
import {
  degToRad,
  type CssPixels,
  type Degrees,
  type DevicePixels,
  type Ratio,
} from "@carma-units";
import { getCameraCalibration } from "../../core/utils/calibration";
import {
  originalOf,
  pyramidOf,
  pyramidOptionsOf,
  type ObliqueViewportPhoto,
} from "./oblique-viewport-source";
import {
  fitNativePreviewView,
  nativePixelPool,
  nativePreviewSource,
  rememberNativePreviewView,
  lastNativePreviewView,
} from "./native-preview-pool";

/** Start the landing view during the flight, using the visible preview's pool. */
export const preparePreviewFlight = (
  map: MaplibreMap,
  photo: ObliqueViewportPhoto,
  rollDeg: Degrees
): (() => void) => {
  const calibration = getCameraCalibration(
    photo.dataset,
    photo.record.cameraId
  );
  const source = nativePreviewSource({
    imageId: photo.record.sourceId,
    path: photo.dataset.previewPath,
    sourceUrl: originalOf(photo) ?? pyramidOf(photo) ?? "",
    ...pyramidOptionsOf(photo),
    avifOnly: photo.dataset.avifOnly,
    nativeSize: {
      width: calibration.widthPx as DevicePixels,
      height: calibration.heightPx as DevicePixels,
    },
    minimumQualityLevel: photo.dataset.minimumPreviewQualityLevel,
  });
  const forecast = fitNativePreviewView(
    source,
    map.transform.width,
    map.transform.height,
    degToRad(rollDeg),
    window.devicePixelRatio || 1
  );
  rememberNativePreviewView(source, forecast.view, forecast.pixels);
  const releaseNetwork = acquireForegroundNetwork(
    map,
    "oblique-flight-preview"
  );
  let releasePixels: (() => void) | undefined;
  let unsubscribe: (() => void) | undefined;
  try {
    const lease = nativePixelPool.acquire(source);
    releasePixels = lease.release;
    const releaseWhenReady = () => {
      if (lease.stack.metrics.visibleReady) releaseNetwork();
    };
    unsubscribe = lease.stack.onContentChange(releaseWhenReady);
    lease.stack.setView(forecast.view, forecast.pixels);
    releaseWhenReady();
    void lease.stack.ready.catch(releaseNetwork);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      unsubscribe?.();
      releaseNetwork();
      lease.release();
    };
  } catch {
    unsubscribe?.();
    releasePixels?.();
    releaseNetwork();
    // Preparation is optional; a missing source must never cancel navigation.
    return () => {};
  }
};

/** The same calibrated viewport mapping drives preparation, direct blending and live pixels. */
export const previewLandingProjection = (
  map: MaplibreMap,
  photo: ObliqueViewportPhoto,
  pose: ObliquePose,
  altitude: number,
  frame: MaplibreMap["transform"],
  anchor?: MercatorCoordinate
) => {
  const calibration = getCameraCalibration(
    photo.dataset,
    photo.record.cameraId
  );
  const scene = acquireSharedThreeScene(map);
  try {
    const origin = scene.layer.projectSceneToLngLat([0, 0, 0]);
    if (!origin) throw Error("Zielausschnitt ist noch nicht bestimmbar.");
    const originMercator = MercatorCoordinate.fromLngLat(origin, 0);
    const scale = originMercator.meterInMercatorCoordinateUnits();
    // Same east/up/south scene-to-Mercator transform as the shared renderer.
    const sceneToMercator = new Matrix4().set(
      scale,
      0,
      0,
      originMercator.x,
      0,
      0,
      scale,
      originMercator.y,
      0,
      scale,
      0,
      originMercator.z,
      0,
      0,
      0,
      1
    );
    const sceneToClip = new Matrix4()
      .fromArray(
        frame.getProjectionDataForCustomLayer(true)
          .mainMatrix as unknown as number[]
      )
      .multiply(sceneToMercator);
    const sceneFromLocal = getCameraLocalMercatorFit(
      origin,
      [frame.center.lng, frame.center.lat],
      { correctEllipsoidMetric: true }
    );
    const projector = imageProjectionMatrix(
      photo.record,
      calibration,
      pose,
      sceneToPhotoEnu(origin, sceneFromLocal, pose, altitude)
    );
    const position = anchor?.toLngLat();
    const sceneAnchor =
      anchor && position
        ? presentationPointToScene(
            {
              longitude: position.lng,
              latitude: position.lat,
              heightMeters: anchor.toAltitude(),
            },
            origin,
            sceneFromLocal
          )
        : undefined;
    if (anchor && !sceneAnchor)
      throw Error("Zielanker ist noch nicht bestimmbar.");
    return viewportImageProjection(projector, sceneToClip, sceneAnchor);
  } finally {
    scene.release();
  }
};

/** Bound the visible target regions across the actual prepared camera trajectory. */
export const previewLandingView = (
  map: MaplibreMap,
  photo: ObliqueViewportPhoto,
  pose: ObliquePose,
  altitude: number,
  frames: readonly MaplibreMap["transform"][],
  anchor: MercatorCoordinate
): { view: ImageView; pixels: number } => {
  const calibration = getCameraCalibration(
    photo.dataset,
    photo.record.cameraId
  );
  const nativeSize = {
    width: calibration.widthPx as DevicePixels,
    height: calibration.heightPx as DevicePixels,
  };
  const pixelRatio = globalThis.devicePixelRatio || 1;
  const windows = frames.map((frame) =>
    projectedNativePreviewWindow(
      previewLandingProjection(map, photo, pose, altitude, frame, anchor),
      { width: frame.width as CssPixels, height: frame.height as CssPixels },
      nativeSize,
      pixelRatio as Ratio
    )
  );
  if (!windows.length || windows.some((window) => !window))
    throw Error("Das Zielbild deckt den sichtbaren Ausschnitt nicht ab.");
  const regions = windows.filter((window) => window !== null);
  const density = Math.max(
    ...regions.map((window) => window.target.width / window.source.width)
  );
  const guard = Math.ceil((2 * pixelRatio) / density);
  const x = Math.max(
    0,
    Math.min(...regions.map((window) => window.source.x)) - guard
  );
  const y = Math.max(
    0,
    Math.min(...regions.map((window) => window.source.y)) - guard
  );
  const right = Math.min(
    nativeSize.width,
    Math.max(
      ...regions.map((window) => window.source.x + window.source.width)
    ) + guard
  );
  const bottom = Math.min(
    nativeSize.height,
    Math.max(
      ...regions.map((window) => window.source.y + window.source.height)
    ) + guard
  );
  const view: ImageView = {
    visible: {
      x: x as DevicePixels,
      y: y as DevicePixels,
      width: (right - x) as DevicePixels,
      height: (bottom - y) as DevicePixels,
    },
    density: density as Ratio,
  };
  const pixels =
    Math.ceil((right - x) * density) * Math.ceil((bottom - y) * density);
  // A flight may expose more than one viewport, but never allocate a full-photo
  // texture merely because a poorly aligned candidate crosses the view.
  const viewportPixels = Math.max(
    ...frames.map(
      (frame) =>
        Math.ceil(frame.width * pixelRatio) *
        Math.ceil(frame.height * pixelRatio)
    )
  );
  if (pixels > viewportPixels * 8)
    throw Error("Der Übergangsausschnitt ist zu groß.");
  return { view, pixels };
};

/** Start with a complete coarse landing preview; requested detail keeps loading. */
export const preparePreviewLanding = async (
  map: MaplibreMap,
  photo: ObliqueViewportPhoto,
  pose: ObliquePose,
  altitude: number,
  frame: MaplibreMap["transform"],
  anchor: MercatorCoordinate,
  signal: AbortSignal,
  currentPhoto?: ObliqueViewportPhoto,
  trajectoryFrames?: readonly MaplibreMap["transform"][],
  background = false,
  allowCoarseBackground = false
): Promise<(() => void) & { view: ImageView }> => {
  const aborted = () =>
    new DOMException("Bildwechsel abgebrochen", "AbortError");
  if (signal.aborted) throw aborted();
  const calibration = getCameraCalibration(
    photo.dataset,
    photo.record.cameraId
  );
  const nativeSize = {
    width: calibration.widthPx as DevicePixels,
    height: calibration.heightPx as DevicePixels,
  };
  const { view, pixels } = previewLandingView(
    map,
    photo,
    pose,
    altitude,
    trajectoryFrames?.length ? trajectoryFrames : [frame],
    anchor
  );
  const source = nativePreviewSource({
    imageId: photo.record.sourceId,
    path: photo.dataset.previewPath,
    sourceUrl: originalOf(photo) ?? pyramidOf(photo) ?? "",
    ...pyramidOptionsOf(photo),
    avifOnly: photo.dataset.avifOnly,
    nativeSize,
    minimumQualityLevel: photo.dataset.minimumPreviewQualityLevel,
  });
  if (background) {
    // Reuse the pool's bounded low-priority forecast slot. It pauses itself
    // whenever the current photo needs pixels; no second foreground viewport.
    let stop: (() => void) | undefined;
    let unsubscribe: (() => void) | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let released = false;
    let rejectWait: ((reason: unknown) => void) | undefined;
    const release = () => {
      if (released) return;
      released = true;
      unsubscribe?.();
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
      stop?.();
    };
    const cancel = () => {
      rejectWait?.(aborted());
      release();
    };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      await new Promise<void>((resolve, reject) => {
        rejectWait = reject;
        let requested = false;
        const check = () => {
          if (signal.aborted) {
            reject(aborted());
            return;
          }
          const stack = nativePixelPool.peek(source);
          if (stack?.error) {
            reject(Error(stack.error));
            return;
          }
          if (
            requested &&
            stack?.pyramid &&
            stack.plan?.visibleTarget &&
            (stack.metrics.visibleReady ||
              (allowCoarseBackground &&
                residentPreviewLevel(stack, view) !== undefined))
          )
            resolve();
        };
        unsubscribe = nativePixelPool.subscribe(check);
        stop = nativePixelPool.prewarm(source, view, pixels);
        requested = true;
        timeout = setTimeout(
          () => reject(Error("Die Nachbarvorschau ist noch nicht geladen.")),
          5000
        );
        check();
      });
      unsubscribe?.();
      unsubscribe = undefined;
      clearTimeout(timeout);
      rejectWait = undefined;
      if (signal.aborted) throw aborted();
      return Object.assign(release, { view });
    } catch (error) {
      release();
      throw error;
    }
  }
  if (currentPhoto) {
    const currentCalibration = getCameraCalibration(
      currentPhoto.dataset,
      currentPhoto.record.cameraId
    );
    const currentSource = nativePreviewSource({
      imageId: currentPhoto.record.sourceId,
      path: currentPhoto.dataset.previewPath,
      sourceUrl: originalOf(currentPhoto) ?? pyramidOf(currentPhoto) ?? "",
      ...pyramidOptionsOf(currentPhoto),
      avifOnly: currentPhoto.dataset.avifOnly,
      nativeSize: {
        width: currentCalibration.widthPx as DevicePixels,
        height: currentCalibration.heightPx as DevicePixels,
      },
      minimumQualityLevel: currentPhoto.dataset.minimumPreviewQualityLevel,
    });
    const active = nativePixelPool.peek(currentSource);
    if (!active) throw Error("Das aktuelle Bild ist noch nicht verfügbar.");
    const currentView = lastNativePreviewView(currentSource)?.view;
    const currentRenderable = () =>
      currentView
        ? residentPreviewLevel(active, currentView) !== undefined
        : active.metrics.decodedBytes > 0;
    if (!currentRenderable()) {
      await new Promise<void>((resolve, reject) => {
        let unsubscribe: (() => void) | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let settled = false;
        const finish = (error?: unknown) => {
          if (settled) return;
          settled = true;
          unsubscribe?.();
          clearTimeout(timer);
          signal.removeEventListener("abort", cancel);
          error ? reject(error) : resolve();
        };
        const cancel = () => finish(aborted());
        const check = () => {
          if (signal.aborted) finish(aborted());
          else if (active.error) finish(Error(active.error));
          else if (currentRenderable()) finish();
        };
        signal.addEventListener("abort", cancel, { once: true });
        unsubscribe = active.subscribe(check);
        timer = setTimeout(
          () =>
            finish(
              Error("Das aktuelle Bild konnte nicht fertig geladen werden.")
            ),
          20000
        );
        check();
        if (settled) {
          unsubscribe();
          clearTimeout(timer);
        }
      });
    }
  }
  if (signal.aborted) throw aborted();
  const releaseNetwork = acquireForegroundNetwork(
    map,
    "oblique-seamless-target"
  );
  let releasePixels: (() => void) | undefined;
  let unsubscribe: (() => void) | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let released = false;
  let rejectWait: ((reason: unknown) => void) | undefined;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(timeout);
    unsubscribe?.();
    signal.removeEventListener("abort", cancel);
    releasePixels?.();
    releaseNetwork();
  };
  const cancel = () => {
    rejectWait?.(aborted());
    release();
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted) throw aborted();
    const lease = nativePixelPool.acquire(source);
    releasePixels = lease.release;
    const stack = lease.stack;
    await new Promise<void>((resolve, reject) => {
      rejectWait = reject;
      let requested = false;
      const check = () => {
        if (signal.aborted) {
          reject(aborted());
          return;
        }
        if (stack.error) {
          reject(Error(stack.error));
          return;
        }
        if (
          requested &&
          stack.pyramid &&
          stack.plan?.visibleTarget &&
          residentPreviewLevel(stack, view) !== undefined
        )
          resolve();
      };
      unsubscribe = stack.subscribe(check);
      // Set the exact view before accepting readiness from a previously cached stack.
      stack.setView(view, pixels);
      requested = true;
      timeout = setTimeout(
        () =>
          reject(
            Error("Der Zielausschnitt konnte nicht rechtzeitig geladen werden.")
          ),
        20000
      );
      void stack.ready.then(check, reject);
      check();
    });
    clearTimeout(timeout);
    unsubscribe?.();
    unsubscribe = undefined;
    rejectWait = undefined;
    if (signal.aborted) throw aborted();
    rememberNativePreviewView(source, view, pixels);
    return Object.assign(release, { view });
  } catch (error) {
    release();
    throw error;
  }
};
