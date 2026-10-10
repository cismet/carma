import {
  ThreeImageLevels,
  type ImageLevelStack,
  type ImageLevelsTexture,
  type ImageView,
  type ImageRect,
  type ImagePyramidSource,
  type ImageLevelStackLease,
} from "@carma-commons/image-pyramid";
import {
  acquireSharedThreeScene,
  getSharedThreeSceneRuntimes,
  subscribeSharedThreeTerrain,
  type SharedThreeSceneFrame,
} from "@carma-mapping/engines/maplibre";
import type { DevicePixels, Ratio } from "@carma-units";
import type { Map as MaplibreMap } from "maplibre-gl";
import { LinearFilter, Matrix3, Matrix4, SRGBColorSpace, Texture } from "three";
import {
  MAX_HOVER_PHOTO_TRAILS,
  type HoverPhotoProjection,
} from "../footprint-outline-layer";
import { sceneToPhotoEnu } from "../../core/utils/image-projection";
import { getCameraCalibration } from "../../core/utils/calibration";
import { nativePixelPool, nativePreviewSource } from "./native-preview-pool";
import {
  originalOf,
  pyramidOf,
  pyramidOptionsOf,
} from "./oblique-viewport-source";
import {
  readMosaicRegionQuality,
  type MosaicRegionQuality,
} from "./mosaic-region-quality";
import {
  planHoverPhotoView,
  sampleVisibleSurface,
  type VisibleSurfaceSamples,
  type HoverPhotoView,
  type VisibleSurfaceOptions,
} from "./sample-visible-surface";

const MAX_SNAPSHOT_PIXELS = 4 * 1024 * 1024;
const MAX_TRAIL_EDGE = 512 as DevicePixels;
const REFINE_INTERVAL_MS = 1000 / 30;
type PhotoPixels = {
  texture: Texture;
  revision: number;
  size: { width: number; height: number };
  canvas?: OffscreenCanvas;
  composer?: ThreeImageLevels;
  stack?: ImageLevelStack;
  frozen?: boolean;
  rect?: ImageRect;
  uv?: Matrix4;
  projected?: Matrix4;
  quality?: MosaicRegionQuality;
  complete?: boolean;
  crop?: ImageRect;
  density?: number;
};
let nextId = 0;

/** Bounded visible photo detail over a coarse underlay; footprint events own its lifetime. */
export const createHoverPhotoDrape = (
  map: MaplibreMap,
  options: {
    readBase?: (
      source: ImagePyramidSource,
      signal: AbortSignal
    ) => Promise<OffscreenCanvas | undefined>;
    onLoadingChange?: (loading: boolean) => void;
    showBasemapLabels?: () => boolean;
    intersectSurface?: VisibleSurfaceOptions["intersectSurface"];
  } = {}
) => {
  const scene = acquireSharedThreeScene(map);
  const prefix = `oblique-hover-photo-${++nextId}`;
  const identity = new Matrix3();
  const snapshots = new Map<string, PhotoPixels>();
  const details = new Map<string, PhotoPixels>();
  const disposePixels = (pixels: PhotoPixels) => {
    if (pixels.composer) pixels.composer.dispose();
    else pixels.texture.dispose();
    if (pixels.canvas) pixels.canvas.width = pixels.canvas.height = 1;
  };
  const setGpuPixels = (
    pixels: PhotoPixels,
    result: ImageLevelsTexture,
    native: { width: number; height: number }
  ) => {
    pixels.texture = result.texture;
    pixels.revision = result.revision;
    pixels.rect = result.rect;
    const crop = result.rect;
    (pixels.uv ??= new Matrix4()).set(
      native.width / crop.width,
      0,
      0,
      -crop.x / crop.width,
      0,
      native.height / crop.height,
      0,
      1 - (native.height - crop.y) / crop.height,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1
    );
  };
  const freezePixels = (pixels: PhotoPixels) => {
    if (pixels.frozen) return;
    pixels.composer?.freezeSnapshot();
    pixels.stack = undefined;
    pixels.frozen = true;
  };
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryKey = "";
  let retryAttempt = 0;
  let viewport:
    | { clip: Matrix4; pixels: { width: number; height: number }; key: string }
    | undefined;
  let requestedView = "";
  let surfaceDirty = false;
  let surfaceRevision = "";
  let sampledSurface:
    | {
        viewport: NonNullable<typeof viewport>;
        controller: AbortController;
        promise: Promise<VisibleSurfaceSamples | null>;
      }
    | undefined;
  const invalidateSurfaceSamples = () => {
    sampledSurface?.controller.abort();
    sampledSurface = undefined;
  };
  const readSurfaceSamples = (
    requestedViewport: NonNullable<typeof viewport>
  ) => {
    if (sampledSurface?.viewport === requestedViewport)
      return sampledSurface.promise;
    invalidateSurfaceSamples();
    const controller = new AbortController();
    const promise = sampleVisibleSurface({
      clip: requestedViewport.clip,
      pixels: requestedViewport.pixels,
      projectEye: (point) =>
        scene.layer.projectSceneToLngLat([point.x, point.y, point.z]),
      intersectSurface: options.intersectSurface!,
      signal: controller.signal,
      isCurrent: () => !disposed && viewport === requestedViewport,
    }).catch(() => null);
    const sample = { viewport: requestedViewport, controller, promise };
    sampledSurface = sample;
    void promise.then((result) => {
      if (!result?.samples.length && sampledSurface === sample)
        sampledSurface = undefined;
    });
    return promise;
  };
  let requestTimer: ReturnType<typeof setTimeout> | undefined;
  let latest: readonly HoverPhotoProjection[] = [];
  let disposed = false;
  let pinGeneration = 0;
  let pinned:
    | {
        projection: HoverPhotoProjection;
        photoFromReference: Matrix4;
        reference: { longitude: number; latitude: number };
        frameKey: string;
      }
    | undefined;
  let lastHoveredId: string | undefined;
  let warming:
    | {
        id: string;
        missingSurface: boolean;
        ready: boolean;
        cancel: () => void;
      }
    | undefined;
  const stopWarming = () => warming?.cancel();
  // Keep base and ROI separately: a pinned photo never loses pixels outside
  // its detailed crop. Retired composers release all decoded-tile ownership.
  const freezeImage = (imageId: string) => {
    const base = snapshots.get(imageId),
      detail = details.get(imageId);
    if (base) freezePixels(base);
    if (detail) freezePixels(detail);
  };
  const retireSnapshot = (projection: HoverPhotoProjection) => {
    const native = getCameraCalibration(
      projection.dataset,
      projection.record.cameraId
    );
    const renderer = scene.layer.getRenderer?.();
    for (const pixels of [
      snapshots.get(projection.record.id),
      details.get(projection.record.id),
    ]) {
      if (!pixels || (pixels.frozen && !pixels.canvas)) continue;
      // The prefetch bootstrap is already a CPU canvas. Shrink it once on
      // retirement; progressive resident-tile updates never use this path.
      if (
        pixels.canvas &&
        Math.max(pixels.size.width, pixels.size.height) > MAX_TRAIL_EDGE
      ) {
        const scale =
          MAX_TRAIL_EDGE / Math.max(pixels.size.width, pixels.size.height);
        const canvas = new OffscreenCanvas(
          Math.max(1, Math.floor(pixels.size.width * scale)),
          Math.max(1, Math.floor(pixels.size.height * scale))
        );
        const context = canvas.getContext("2d");
        if (context) {
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "low";
          context.drawImage(pixels.canvas, 0, 0, canvas.width, canvas.height);
          pixels.texture.dispose();
          pixels.canvas.width = pixels.canvas.height = 1;
          const texture = new Texture(canvas);
          texture.colorSpace = SRGBColorSpace;
          texture.minFilter = texture.magFilter = LinearFilter;
          texture.generateMipmaps = false;
          texture.needsUpdate = true;
          pixels.texture = texture;
          pixels.canvas = canvas;
          pixels.size = { width: canvas.width, height: canvas.height };
          pixels.revision++;
        } else {
          canvas.width = canvas.height = 1;
          disposePixels(pixels);
          if (snapshots.get(projection.record.id) === pixels)
            snapshots.delete(projection.record.id);
          if (details.get(projection.record.id) === pixels)
            details.delete(projection.record.id);
          continue;
        }
      }
      if (pixels.composer && pixels.stack && renderer) {
        const rect = pixels.crop ?? {
          x: 0 as DevicePixels,
          y: 0 as DevicePixels,
          width: native.widthPx as DevicePixels,
          height: native.heightPx as DevicePixels,
        };
        const scale = Math.min(
          1,
          MAX_TRAIL_EDGE / Math.max(pixels.size.width, pixels.size.height)
        );
        let size = {
          width: Math.max(1, Math.floor(pixels.size.width * scale)),
          height: Math.max(1, Math.floor(pixels.size.height * scale)),
        };
        // Tile-aligned GPU capacity can round up; reduce the requested density
        // once more when necessary so fading buffers remain bounded.
        for (let pass = 0; pass < 2; pass++) {
          const result = pixels.composer.renderToTarget(renderer, rect, size);
          if (!result) break;
          setGpuPixels(pixels, result, {
            width: native.widthPx,
            height: native.heightPx,
          });
          pixels.size = size;
          const image = result.texture.image as {
            width: number;
            height: number;
          };
          const extent = Math.max(image.width, image.height);
          if (extent <= MAX_TRAIL_EDGE) break;
          size = {
            width: Math.max(
              1,
              Math.floor((size.width * MAX_TRAIL_EDGE) / extent)
            ),
            height: Math.max(
              1,
              Math.floor((size.height * MAX_TRAIL_EDGE) / extent)
            ),
          };
        }
      }
      freezePixels(pixels);
    }
  };
  const publish = () => {
    if (disposed) return;
    const current =
      pinned?.projection ?? latest.find((item) => item.isCurrent) ?? latest[0];
    const detail = current && details.get(current.record.id);
    // The retained photograph is a surface underlay, independent of both flat
    // preview slots. Preserve base plus ROI even if flattening was unavailable.
    const held = pinned;
    const heldLayers = held
      ? [snapshots.get(held.projection.record.id), detail].flatMap(
          (snapshot, index) => {
            if (!snapshot) return [];
            const uv = snapshot.uv;
            return [
              {
                texture: snapshot.texture,
                textureRevision: snapshot.revision,
                sceneToTexture: uv
                  ? (snapshot.projected ??= new Matrix4())
                      .copy(uv)
                      .multiply(held.projection.sceneToTexture)
                  : held.projection.sceneToTexture,
                sourceProjection: held.projection.sceneToTexture,
                opacity: 1,
                priority: 110 + index,
              },
            ];
          }
        )
      : [];
    scene.layer.setMapStylePhotoMosaic?.(
      `${prefix}-pin`,
      heldLayers.length ? heldLayers : null
    );
    const layers = pinned
      ? []
      : detail && current
      ? [
          { projection: current, snapshot: snapshots.get(current.record.id) },
          { projection: current, snapshot: detail },
        ]
      : (current ? [current] : []).map((projection) => ({
          projection,
          snapshot: snapshots.get(projection.record.id),
        }));
    const trails = pinned
      ? []
      : latest
          .filter((item) => item.record.id !== current?.record.id)
          .flatMap((projection, index) =>
            [
              snapshots.get(projection.record.id),
              details.get(projection.record.id),
            ].flatMap((snapshot, layer) =>
              snapshot
                ? [
                    {
                      texture: snapshot.texture,
                      textureRevision: snapshot.revision,
                      sceneToTexture: snapshot.uv
                        ? snapshot.uv
                            .clone()
                            .multiply(projection.sceneToTexture)
                        : projection.sceneToTexture,
                      sourceProjection: projection.sceneToTexture,
                      opacity: projection.opacity,
                      priority: 2 * (MAX_HOVER_PHOTO_TRAILS - index) + layer,
                    },
                  ]
                : []
            )
          );
    scene.layer.setMapStylePhotoMosaic?.(
      `${prefix}-trails`,
      trails.length ? trails : null
    );
    for (let slot = 0; slot < 2; slot++) {
      const entry = layers[slot];
      const projection = entry?.projection,
        snapshot = entry?.snapshot;
      const uv = snapshot && snapshot.uv;
      scene.layer.setMapStyleScreenOverlay?.(
        `${prefix}-${slot}`,
        snapshot && projection.opacity > 0
          ? {
              texture: snapshot.texture,
              textureRevision: snapshot.revision,
              viewportToTexture: identity,
              projective: {
                sceneToTexture: uv
                  ? (snapshot.projected ??= new Matrix4())
                      .copy(uv)
                      .multiply(projection.sceneToTexture)
                  : projection.sceneToTexture,
                sourceProjection: projection.sceneToTexture,
                ...(detail && snapshot !== detail ? { underlay: true } : {}),
              },
              opacity: projection.isCurrent ? 1 : projection.opacity,
              priority:
                (projection.isCurrent ? 2 : 1) +
                (snapshot === detail ? 0.1 : 0),
              showBasemapLabels: options.showBasemapLabels?.() ?? true,
            }
          : null
      );
    }
  };
  const retry = (projection: HoverPhotoProjection) => {
    const current = latest.find((item) => item.isCurrent);
    if (disposed || pinned || current?.record.id !== projection.record.id)
      return;
    clearTimeout(retryTimer);
    retryKey = `${current.record.id}:${viewport?.key ?? ""}`;
    retryAttempt = Math.min(retryAttempt + 1, 4);
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      const current = latest.find((item) => item.isCurrent);
      if (disposed || pinned || current?.record.id !== projection.record.id)
        return;
      requestedView = "";
      if (options.intersectSurface) schedule();
      else start(current);
    }, Math.min(500 * 2 ** (retryAttempt - 1), 4000));
  };
  const schedule = () => {
    if (!options.intersectSurface || pinned || disposed || !viewport) return;
    const current = latest.find((item) => item.isCurrent);
    if (!current) return;
    const key = `${current.record.id}:${viewport.key}`;
    if (retryTimer !== undefined) {
      if (retryKey === key) return;
      clearTimeout(retryTimer);
      retryTimer = undefined;
      retryAttempt = 0;
    }
    if (requestedView === key) return;
    clearTimeout(requestTimer);
    warming?.cancel();
    requestedView = key;
    requestTimer = setTimeout(() => {
      requestTimer = undefined;
      const selected = latest.find(
        (item) => item.record.id === current.record.id
      );
      if (!disposed && !pinned && requestedView === key && selected)
        start(selected);
    }, 80);
  };

  const removeFrame = scene.layer.addBeforeRenderCallback?.(
    (renderFrame: SharedThreeSceneFrame) => {
      if (disposed) return;
      if (options.intersectSurface && !pinned) {
        const clip = new Matrix4().multiplyMatrices(
          renderFrame.renderCamera.projectionMatrix,
          renderFrame.renderCamera.matrixWorldInverse
        );
        const pixels = {
          width: renderFrame.viewport.x,
          height: renderFrame.viewport.y,
        };
        const key = [...clip.elements, pixels.width, pixels.height].join(",");
        if (viewport?.key !== key) {
          invalidateSurfaceSamples();
          viewport = { clip, pixels, key };
          schedule();
        }
      }
      if (surfaceDirty && (warming?.missingSurface || warming?.ready)) {
        warming.cancel();
        requestedView = "";
      }
      if (surfaceDirty && !warming && !requestTimer && !pinned) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
        surfaceDirty = false;
        requestedView = "";
        schedule();
      }
      if (!pinned) return;
      const frame = scene.layer.getLocalFrame();
      const origin = scene.layer.projectSceneToLngLat([0, 0, 0]);
      if (!frame || !origin) return;
      const key = `${origin.join(",")}:${frame.revision}`;
      if (pinned.frameKey === key) return;
      pinned.frameKey = key;
      pinned.projection.sceneToTexture
        .copy(pinned.photoFromReference)
        .multiply(
          sceneToPhotoEnu(origin, frame.sceneFromLocal, pinned.reference, 0)
        );
      publish();
    }
  );
  const refreshSurfaces = () => {
    if (disposed || !options.intersectSurface) return;
    const revision = getSharedThreeSceneRuntimes(map)
      .map(
        (runtime) =>
          `${runtime.id}:${runtime.root.visible}:${
            runtime.mapStyleProjectionVersion?.() ?? 0
          }:${runtime.hasRenderableContent?.() ?? false}`
      )
      .join("|");
    if (surfaceRevision === revision) return;
    surfaceRevision = revision;
    invalidateSurfaceSamples();
    surfaceDirty = true;
    map.triggerRepaint();
  };
  if (options.intersectSurface) map.on("idle", refreshSurfaces);
  const unsubscribeTerrain = options.intersectSurface
    ? subscribeSharedThreeTerrain(map, () => {
        invalidateSurfaceSamples();
        surfaceDirty = true;
        map.triggerRepaint();
      })
    : undefined;
  const start = (projection: HoverPhotoProjection) => {
    warming?.cancel();
    const photo = { record: projection.record, dataset: projection.dataset };
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
    let lease: ImageLevelStackLease | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const release = () => {
      const previous = lease;
      lease = undefined;
      clearTimeout(deadline);
      unsubscribeContent?.();
      unsubscribeContent = undefined;
      if (previous) freezeImage(photo.record.id);
      previous?.release();
      previous?.stack.configure({
        idlePrefetch: "none",
      });
    };
    let unsubscribe: (() => void) | undefined;
    let unsubscribeContent: (() => void) | undefined;
    let quality: MosaicRegionQuality | undefined;
    let paintTimer: ReturnType<typeof setTimeout> | undefined;
    let lastPaintAt = -Infinity;
    let cancelled = false;
    let checking = false;
    let starting = true;
    let readingBase = true;
    let configured = false;
    let region: HoverPhotoView | null | undefined;
    const needsRegion = !!options.intersectSurface;
    const requestedViewport = viewport;
    let width = Math.ceil(nativeSize.width / 16),
      height = Math.ceil(nativeSize.height / 16);
    const baseController = new AbortController();
    const job = {
      id: photo.record.id,
      missingSurface: false,
      ready: false,
      cancel: () => {
        if (cancelled) return;
        cancelled = true;
        baseController.abort();
        options.onLoadingChange?.(false);
        unsubscribe?.();
        clearTimeout(paintTimer);
        freezeImage(job.id);
        release();
        if (warming === job) warming = undefined;
      },
    };
    warming = job;
    options.onLoadingChange?.(true);
    const snapshotBase = (canvas: OffscreenCanvas) => {
      const previous = snapshots.get(job.id);
      // A late bootstrap must never replace an already composed GPU image.
      if (
        previous &&
        (previous.composer ||
          (previous.size.width >= canvas.width &&
            previous.size.height >= canvas.height))
      ) {
        canvas.width = canvas.height = 1;
        return;
      }
      if (previous) disposePixels(previous);
      const texture = new Texture(canvas);
      texture.colorSpace = SRGBColorSpace;
      texture.minFilter = texture.magFilter = LinearFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      snapshots.set(job.id, {
        texture,
        canvas,
        revision: 1,
        size: { width: canvas.width, height: canvas.height },
        complete: true,
      });
      publish();
      map.triggerRepaint();
    };
    // Show the finest complete prefetched level immediately. The direct hover
    // owns a cancellable demand lease, independent of navigation's forecast slot.
    void Promise.resolve(options.readBase?.(source, baseController.signal))
      .then((canvas) => {
        if (!canvas) return;
        if (cancelled || disposed || warming !== job) {
          canvas.width = canvas.height = 1;
          return;
        }
        snapshotBase(canvas);
      })
      .catch(() => undefined)
      .finally(() => {
        readingBase = false;
        check();
      });
    const fail = () => {
      job.cancel();
      retry(projection);
    };
    const setView = (density: number) => {
      const view: ImageView = region?.view ?? {
        visible: { x: 0 as DevicePixels, y: 0 as DevicePixels, ...nativeSize },
        density: density as Ratio,
      };
      lease?.stack.setView(view, width * height);
    };
    const check = () => {
      if (cancelled || disposed || warming !== job || checking || starting)
        return;
      checking = true;
      try {
        if (needsRegion && region === undefined) return;
        const missingSurface = needsRegion && region === null;
        const base = snapshots.get(job.id);
        if (
          missingSurface &&
          base?.complete &&
          base.size.width >= Math.ceil(nativeSize.width / 64) &&
          base.size.height >= Math.ceil(nativeSize.height / 64)
        ) {
          job.cancel();
          retry(projection);
          return;
        }
        // Actual preview pixels always take priority. A hover may use spare
        // capacity, but it must not compete when a new preview starts loading.
        const blocked = nativePixelPool.metrics.images.some(
          (image) =>
            image.active && image.id !== source.id && !image.visibleReady
        );
        if (blocked) {
          release();
          return;
        }
        if (!lease) {
          if (
            nativePixelPool.metrics.images.some(
              (image) => image.active && image.id === source.id
            )
          ) {
            // Never replace the current preview's crop with a whole-photo hover.
            if (!readingBase) job.cancel();
            return;
          }
          lease = nativePixelPool.acquire(source);
          lease.stack.source.priority = "low";
          lease.stack.configure({
            idlePrefetch: "none",
            decodedBudget: () =>
              Math.max(MAX_SNAPSHOT_PIXELS, width * height) * 8,
          });
          unsubscribeContent = lease.stack.onContentChange?.(check);
          deadline = setTimeout(fail, 30000);
          setView(
            Math.max(width / nativeSize.width, height / nativeSize.height)
          );
        }
        const stack = lease.stack;
        if (stack.error && !stack.metrics.visibleReady) {
          if (!readingBase) fail();
          return;
        }
        const pyramid = stack?.pyramid;
        if (!stack || !pyramid) return;
        // Named L4 is preferred. Read its actual dimensions rather than assuming
        // whether the delivered pyramid starts with L0 or L1 at native size.
        const level =
          pyramid.levels.find((candidate) => candidate.level === 4) ??
          pyramid.levels.find((candidate) => candidate.level === 3);
        if (
          !needsRegion &&
          (!level ||
            !Number.isSafeInteger(level.width) ||
            !Number.isSafeInteger(level.height) ||
            level.width <= 0 ||
            level.height <= 0 ||
            Math.max(level.width, level.height) > 4096 ||
            level.width * level.height > MAX_SNAPSHOT_PIXELS)
        ) {
          fail();
          return;
        }
        const resident = snapshots.get(job.id);
        if (
          !needsRegion &&
          resident?.complete &&
          !resident.composer &&
          level &&
          resident.size.width >= level.width &&
          resident.size.height >= level.height
        ) {
          job.ready = true;
          options.onLoadingChange?.(false);
          clearTimeout(deadline);
          return;
        }
        if (!configured) {
          configured = true;
          width =
            region?.width ??
            (missingSurface ? Math.ceil(nativeSize.width / 64) : level!.width);
          height =
            region?.height ??
            (missingSurface
              ? Math.ceil(nativeSize.height / 64)
              : level!.height);
          const previous = region ? details.get(job.id) : snapshots.get(job.id);
          if (
            previous?.size.width === width &&
            previous.size.height === height &&
            (!region ||
              ("crop" in previous &&
                previous.crop &&
                previous.crop.x === region.view.visible.x &&
                previous.crop.y === region.view.visible.y &&
                previous.crop.width === region.view.visible.width &&
                previous.crop.height === region.view.visible.height &&
                previous.density === region.view.density))
          )
            quality = previous.quality;
          setView(
            Math.max(width / nativeSize.width, height / nativeSize.height)
          );
        }
        const range = stack.plan?.visibleTarget;
        const target = pyramid.levels.find(
          (candidate) => candidate.level === range?.level
        );
        if (
          !range ||
          !target ||
          (!needsRegion &&
            (target.width < width ||
              range.col0 !== 0 ||
              range.row0 !== 0 ||
              range.col1 !== target.cols ||
              range.row1 !== target.rows))
        )
          return;
        const crop = region?.view.visible ?? {
          x: 0 as DevicePixels,
          y: 0 as DevicePixels,
          ...nativeSize,
        };
        const complete = stack.metrics.visibleReady;
        job.ready = complete;
        const sincePaint = performance.now() - lastPaintAt;
        if (sincePaint < REFINE_INTERVAL_MS) {
          paintTimer ??= setTimeout(() => {
            paintTimer = undefined;
            check();
          }, Math.ceil(REFINE_INTERVAL_MS - sincePaint));
          return;
        }
        const nextQuality = readMosaicRegionQuality(stack, crop, quality);
        if (!nextQuality && (!complete || quality)) {
          if (complete) {
            if (missingSurface) {
              const base = snapshots.get(job.id);
              if (base) base.complete = true;
            }
            options.onLoadingChange?.(false);
            clearTimeout(deadline);
            if (missingSurface) {
              job.cancel();
              retry(projection);
            }
          }
          return;
        }
        const previous = region ? details.get(job.id) : snapshots.get(job.id);
        const renderer = scene.layer.getRenderer?.();
        if (!renderer) return;
        const reusable = previous?.composer && !previous.frozen;
        const composer = reusable ? previous.composer! : new ThreeImageLevels();
        composer.attach(stack);
        let result: ImageLevelsTexture | null;
        try {
          result = composer.renderToTarget(renderer, crop, { width, height });
        } catch (error) {
          if (!reusable) composer.dispose();
          throw error;
        }
        if (!result) {
          if (!reusable) composer.dispose();
          return;
        }
        const pixels: PhotoPixels = reusable
          ? previous
          : {
              texture: result.texture,
              revision: result.revision,
              composer,
              size: { width, height },
            };
        pixels.stack = stack;
        pixels.size = { width, height };
        pixels.crop = region?.view.visible;
        pixels.density = region?.view.density;
        pixels.quality = nextQuality ?? quality;
        pixels.complete = complete;
        setGpuPixels(pixels, result, nativeSize);
        if (previous && !reusable) disposePixels(previous);
        (region ? details : snapshots).set(job.id, pixels);
        publish();
        map.triggerRepaint();
        lastPaintAt = performance.now();
        quality = nextQuality ?? quality;
        retryAttempt = 0;
        if (complete) {
          options.onLoadingChange?.(false);
          clearTimeout(deadline);
          if (missingSurface) {
            job.cancel();
            retry(projection);
          }
        } else {
          clearTimeout(deadline);
          deadline = setTimeout(fail, 30000);
        }
      } catch {
        fail();
      } finally {
        checking = false;
      }
    };
    unsubscribe = nativePixelPool.subscribe(check);
    starting = false;
    if (needsRegion && requestedViewport) {
      void planHoverPhotoView({
        photo: {
          id: photo.record.id,
          projection: projection.sceneToTexture.clone(),
          ...nativeSize,
        },
        clip: requestedViewport.clip,
        pixels: requestedViewport.pixels,
        projectEye: (point) =>
          scene.layer.projectSceneToLngLat([point.x, point.y, point.z]),
        intersectSurface: options.intersectSurface!,
        surfaceSamples: readSurfaceSamples(requestedViewport),
        signal: baseController.signal,
        isCurrent: () =>
          !disposed && warming === job && viewport === requestedViewport,
      })
        .then((result) => {
          if (cancelled || disposed || warming !== job) return;
          region = result;
          job.missingSurface = region === null;
          width = region?.width ?? Math.ceil(nativeSize.width / 64);
          height = region?.height ?? Math.ceil(nativeSize.height / 64);
          check();
        })
        .catch(fail);
    }
    check();
  };
  return {
    /** Republish decoration flags without fetching or replacing photo pixels. */
    refreshStyle() {
      if (disposed) return;
      publish();
      map.triggerRepaint();
    },
    /** Hold an already visible photo through flight and preview until explicitly
     * released. Camera arrival and flat-image readiness do not end the pin. */
    pin(imageId: string): (() => void) | undefined {
      if (disposed) return;
      const projection = latest.find((item) => item.record.id === imageId);
      const frame = scene.layer.getLocalFrame();
      const origin = scene.layer.projectSceneToLngLat([0, 0, 0]);
      if (
        !projection ||
        (!snapshots.has(imageId) && !details.has(imageId)) ||
        !frame ||
        !origin
      )
        return;
      clearTimeout(requestTimer);
      clearTimeout(retryTimer);
      invalidateSurfaceSamples();
      retryTimer = undefined;
      // Freeze already decoded ROI and base in a bounded surface underlay.
      // This requires no additional fetch, decode, or pixel readback.
      freezeImage(imageId);
      const generation = ++pinGeneration;
      const reference = { longitude: origin[0], latitude: origin[1] };
      pinned = {
        projection: {
          ...projection,
          opacity: 1,
          sceneToTexture: projection.sceneToTexture.clone(),
        },
        photoFromReference: projection.sceneToTexture
          .clone()
          .multiply(
            sceneToPhotoEnu(origin, frame.sceneFromLocal, reference, 0).invert()
          ),
        reference,
        frameKey: `${origin.join(",")}:${frame.revision}`,
      };
      warming?.cancel();
      publish();
      map.triggerRepaint();
      return () => {
        if (disposed || generation !== pinGeneration) return;
        pinGeneration++;
        pinned = undefined;
        scene.layer.setMapStylePhotoMosaic?.(`${prefix}-pin`, null);
        const snapshot = snapshots.get(imageId);
        if (snapshot) {
          disposePixels(snapshot);
          snapshots.delete(imageId);
        }
        const detail = details.get(imageId);
        if (detail) {
          disposePixels(detail);
          details.delete(imageId);
        }
        latest = [];
        requestedView = "";
        publish();
        map.triggerRepaint();
      };
    },
    update(projections: readonly HoverPhotoProjection[]) {
      if (disposed) return;
      const visible = (pinned ? [] : projections).filter(
        (projection) => projection.opacity > 0
      );
      const current = visible.find((projection) => projection.isCurrent);
      const trails = visible
        .filter((projection) => !projection.isCurrent)
        .slice(0, MAX_HOVER_PHOTO_TRAILS);
      latest = current ? [current, ...trails] : trails;
      const retained = new Set(
        latest.map((projection) => projection.record.id)
      );
      if (pinned) retained.add(pinned.projection.record.id);
      for (const [id, snapshot] of snapshots)
        if (!retained.has(id)) {
          disposePixels(snapshot);
          snapshots.delete(id);
        }
      for (const [id, detail] of details)
        if (!retained.has(id)) {
          disposePixels(detail);
          details.delete(id);
        }
      // Downsample resident tiles before releasing the active lease. This never
      // changes the view or asks the source for more bytes/decode work.
      for (const projection of latest)
        if (!projection.isCurrent) retireSnapshot(projection);
      if (warming && warming.id !== current?.record.id) warming.cancel();
      if (current?.record.id !== lastHoveredId) {
        lastHoveredId = current?.record.id;
        clearTimeout(retryTimer);
        retryTimer = undefined;
        retryAttempt = 0;
      }
      if (
        !options.intersectSurface &&
        current &&
        (!snapshots.has(current.record.id) ||
          snapshots.get(current.record.id)?.frozen) &&
        retryTimer === undefined &&
        !warming
      ) {
        try {
          start(current);
        } catch {
          stopWarming();
          retry(current);
        }
      }
      if (!current) {
        clearTimeout(requestTimer);
        requestedView = "";
      } else schedule();
      publish();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidateSurfaceSamples();
      pinGeneration++;
      pinned = undefined;
      removeFrame?.();
      unsubscribeTerrain?.();
      if (options.intersectSurface) map.off("idle", refreshSurfaces);
      clearTimeout(requestTimer);
      clearTimeout(retryTimer);
      warming?.cancel();
      for (let slot = 0; slot < 2; slot++)
        scene.layer.setMapStyleScreenOverlay?.(`${prefix}-${slot}`, null);
      scene.layer.setMapStylePhotoMosaic?.(`${prefix}-pin`, null);
      scene.layer.setMapStylePhotoMosaic?.(`${prefix}-trails`, null);
      for (const snapshot of snapshots.values()) {
        disposePixels(snapshot);
      }
      snapshots.clear();
      for (const detail of details.values()) {
        disposePixels(detail);
      }
      details.clear();
      scene.release();
      map.triggerRepaint();
    },
  };
};
