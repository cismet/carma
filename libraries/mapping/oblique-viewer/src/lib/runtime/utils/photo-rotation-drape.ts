import type { Map as MaplibreMap } from "maplibre-gl";
import {
  ThreeImageLevels,
  tileRangeFor,
  type ImageView,
  type ImageRect,
  type ImageLevelStack,
  type ImageLevelStackLease,
} from "@carma-commons/image-pyramid";
import {
  degToRad,
  negativePiToPi,
  PI,
  type Degrees,
  type DevicePixels,
  type Radians,
  type Ratio,
} from "@carma-units";
import { nativePixelPool, nativePreviewSource } from "./native-preview-pool";
import { residentPreviewLevel } from "./preview-region-ready";
import {
  acquireSharedThreeScene,
  getSharedThreeSceneRuntimes,
  type MapStyleScreenOverlay,
} from "@carma-mapping/engines/maplibre";
import { Matrix3, Matrix4, type Texture } from "three";
import {
  imageProjectionMatrix,
  sceneToPhotoEnu,
} from "../../core/utils/image-projection";
import {
  readMosaicRegionQuality,
  type MosaicRegionQuality,
} from "./mosaic-region-quality";
import type { ScenePreviewPhoto } from "../hooks/useScenePreviewImage";
import {
  originalOf,
  pyramidOf,
  pyramidOptionsOf,
  type ObliqueViewportPhoto,
} from "./oblique-viewport-source";

// Includes two GPU ping-pong pairs and tile-composition headroom.
const PAIR_BYTES = 512 * 1024 * 1024;
// Four visited directions retain composed GPU pixels, not native decoded stacks.
// Detached composers retain their render targets and release source tile textures.
const CACHE_BYTES = 512 * 1024 * 1024;
const CACHE_IMAGES = 4;
const PREPARE_TIMEOUT_MS = 30000;
const REFINEMENT_INTERVAL_MS = 1000 / 30;
const HEADING_EPSILON = degToRad(0.000001 as Degrees);
let nextPairId = 0;

const headingDelta = (from: Radians, to: Radians): Radians => {
  const delta = negativePiToPi((to - from) as Radians);
  // Match flyToImage's negative-direction tie break for an exact half turn.
  return delta === PI ? (-PI as Radians) : delta;
};

type Photo = ScenePreviewPhoto & ObliqueViewportPhoto;
type DrapeDecoration = Pick<
  MapStyleScreenOverlay,
  "backdropLook" | "backdropTint"
>;
type CachedPixels = {
  texture: Texture;
  composer: ThreeImageLevels;
  size: { width: number; height: number };
  textureRect: ImageRect;
  revision: number;
  minimumLevelWidth: number;
  crop?: ImageRect;
  quality?: MosaicRegionQuality;
};
type PreparedPhoto = CachedPixels & {
  photo: Photo;
  slot: 0 | 1;
  projection: Matrix4;
  sourceProjection: Matrix4;
  cropMatrix: Matrix4;
  projectionDirty: boolean;
  stack?: ImageLevelStack;
  dirty: boolean;
};
export type PhotoRotationDrapeTransition = {
  targetImageId: string;
  update: (progress: number) => void;
  finish: () => void;
  /** Reserve the second renderer slot for the ready flat target. */
  reveal?: () => void;
  dispose: () => void;
};
export type PhotoNeighborDrapeTransition = PhotoRotationDrapeTransition & {
  /** Switch from the prepared neighbour beneath the source to the source beneath the new flat photo. */
  handover: () => void;
};
export type PhotoRotationDrape = {
  prepareNeighbor: (
    from: Photo,
    to: Photo,
    views: { sourceView: ImageView; targetView: ImageView }
  ) => PhotoNeighborDrapeTransition | undefined;
  prepare: (
    from: Photo,
    to: Photo,
    options?: {
      sourceOnly?: boolean;
      sourceView?: ImageView;
      requireSource?: boolean;
      retainUntilReveal?: boolean;
      decoration?: DrapeDecoration;
    }
  ) => Promise<PhotoRotationDrapeTransition | undefined>;
  cancel: () => void;
  dispose: () => void;
};

/** Retain calibrated photo pixels for rotation, or only the outgoing seamless view. */
export const createPhotoRotationDrape = (
  map: MaplibreMap,
  options: { showBasemapLabels?: () => boolean } = {}
): PhotoRotationDrape => {
  const scene = acquireSharedThreeScene(map);
  const id = `oblique-rotation-photo-${++nextPairId}`;
  const ids = [`${id}-from`, `${id}-to`];
  const identity = new Matrix3();
  let active: {
    photos: PreparedPhoto[];
    leases: ImageLevelStackLease[];
    subscriptions: (() => void)[];
    cancelWait?: () => void;
    startBearing: Radians;
    bearingDelta: Radians;
    fallbackProgress?: number;
    finished: boolean;
    sourceOnly: boolean;
    revealing?: boolean;
    decoration?: DrapeDecoration;
    neighbor?: boolean;
    key: string;
    finishedTimer?: ReturnType<typeof setTimeout>;
  } | null = null;
  let disposed = false;
  const pixels = new Map<string, CachedPixels>();
  const disposePixels = (item: Pick<CachedPixels, "composer">) =>
    item.composer.dispose();
  const pixelBytes = (item: CachedPixels) => {
    const image = item.texture.image as
      | { width?: number; height?: number }
      | undefined;
    return (
      (image?.width ?? item.size.width) *
      (image?.height ?? item.size.height) *
      8
    );
  };
  const cacheBytes = () =>
    [...pixels.values()].reduce((bytes, item) => bytes + pixelBytes(item), 0);
  const trimPixels = (incomingBytes = 0) => {
    for (const [key, item] of pixels) {
      if (
        pixels.size < CACHE_IMAGES &&
        cacheBytes() + incomingBytes <= CACHE_BYTES
      )
        break;
      if (active?.photos.some((photo) => photo.composer === item.composer))
        continue;
      pixels.delete(key);
      disposePixels(item);
    }
  };
  const cachedPixels = (
    key: string,
    size?: { width: number; height: number }
  ) => {
    const item = pixels.get(key);
    if (
      !item ||
      (size &&
        (item.size.width !== size.width || item.size.height !== size.height))
    )
      return;
    pixels.delete(key);
    pixels.set(key, item);
    return item;
  };

  const region = (item: PreparedPhoto): ImageRect =>
    item.crop ?? {
      x: 0 as DevicePixels,
      y: 0 as DevicePixels,
      width: item.photo.calibration.widthPx as DevicePixels,
      height: item.photo.calibration.heightPx as DevicePixels,
    };
  const cacheSnapshot = (item: PreparedPhoto): CachedPixels => ({
    texture: item.texture,
    composer: item.composer,
    size: item.size,
    textureRect: item.textureRect,
    revision: item.revision,
    minimumLevelWidth: item.minimumLevelWidth,
    crop: item.crop,
    quality: item.quality,
  });
  const draw = (item: PreparedPhoto, quality?: MosaicRegionQuality) => {
    const renderer = scene.layer.getRenderer?.();
    if (!item.stack || !renderer) return false;
    const result = item.composer.renderToTarget(
      renderer,
      region(item),
      item.size
    );
    if (!result) return false;
    const previous = item.textureRect;
    item.projectionDirty ||=
      !previous ||
      previous.x !== result.rect.x ||
      previous.y !== result.rect.y ||
      previous.width !== result.rect.width ||
      previous.height !== result.rect.height;
    item.texture = result.texture;
    item.textureRect = result.rect;
    item.revision = result.revision;
    item.quality =
      quality ?? readMosaicRegionQuality(item.stack, region(item)) ?? undefined;
    for (const cached of pixels.values())
      if (cached.composer === item.composer)
        Object.assign(cached, cacheSnapshot(item));
    item.dirty = false;
    return true;
  };

  // Keep the previous complete target texture if shared-view replanning evicts
  // its base. Partial finer tiles may refine any complete resident base level.
  const hasWholeLevel = (stack: ImageLevelStack, index: number) => {
    const level = stack.pyramid?.levels.find(
      (candidate) => candidate.level === index
    );
    if (!level) return false;
    for (let row = 0; row < level.rows; row++)
      for (let col = 0; col < level.cols; col++)
        if (!stack.isResident(index, col, row)) return false;
    return true;
  };

  const apply = () => {
    if (!active?.photos.length) return;
    const frame = scene.layer.getLocalFrame();
    const origin = scene.layer.projectSceneToLngLat([0, 0, 0]);
    if (!frame || !origin) return;
    const key = `${origin[0]},${origin[1]}:${frame.sceneFromLocal.elements.join(
      ","
    )}`;
    const reproject = active.key !== key;
    const travelled = active.sourceOnly
      ? (0 as Radians)
      : headingDelta(
          active.startBearing,
          degToRad(map.getBearing() as Degrees)
        );
    // Actual heading determines the linear photo mixture independently of easing/time.
    const mix = active.sourceOnly
      ? 0
      : active.finished
      ? 1
      : Math.abs(active.bearingDelta) > HEADING_EPSILON
      ? Math.max(0, Math.min(1, travelled / active.bearingDelta))
      : active.fallbackProgress ?? 0;
    const showTarget = active.neighbor ? !active.finished : mix >= 0.5;
    for (const item of active.photos) {
      const index = item.slot;
      if (reproject) {
        item.sourceProjection.copy(
          imageProjectionMatrix(
            item.photo.record,
            item.photo.calibration,
            item.photo.pose,
            sceneToPhotoEnu(
              origin,
              frame.sceneFromLocal,
              item.photo.pose,
              item.photo.altitude
            )
          )
        );
      }
      if (reproject || item.projectionDirty) {
        item.projection.copy(item.sourceProjection);
        const crop = item.textureRect,
          native = item.photo.calibration;
        if (crop) {
          item.projection.premultiply(
            item.cropMatrix.set(
              native.widthPx / crop.width,
              0,
              0,
              -crop.x / crop.width,
              0,
              native.heightPx / crop.height,
              0,
              1 - (native.heightPx - crop.y) / crop.height,
              0,
              0,
              1,
              0,
              0,
              0,
              0,
              1
            )
          );
        }
        item.projectionDirty = false;
      }
      if (
        (active.neighbor && index !== (showTarget ? 1 : 0)) ||
        (active.revealing && index !== (active.sourceOnly ? 0 : 1))
      ) {
        scene.layer.setMapStyleScreenOverlay?.(ids[index], null);
        continue;
      }
      const opacity = active.neighbor
        ? 1
        : active.revealing
        ? 1
        : index === 0
        ? 1 - mix
        : mix;
      const decoration = active.decoration;
      scene.layer.setMapStyleScreenOverlay?.(ids[index], {
        texture: item.texture,
        textureRevision: item.revision,
        viewportToTexture: identity,
        projective: {
          sceneToTexture: item.projection,
          sourceProjection: item.sourceProjection,
          underlay: true,
          // The target fills source gaps; heading weights govern overlap.
          fillGaps: !active.neighbor && !active.sourceOnly && !active.revealing,
          // The full sensor projection, not the pixel crop, defines the contour.
          frame: decoration
            ? {
                opacity: 0.9 * opacity,
                width: 2,
                feather: 50,
                // The renderer applies frame opacity to both stroke and glow.
                // Match the flat frame's 0.8 glow independently of its 0.9 stroke.
                featherOpacity: 0.8 / 0.9,
              }
            : undefined,
        },
        opacity,
        // Keep the global backdrop constant; footprint coverage follows photo opacity.
        backdropLook: decoration?.backdropLook,
        backdropTint: decoration?.backdropTint,
        backdropOpacity: decoration ? 1 : undefined,
        priority: active.neighbor ? 110 : 100 + index,
        showBasemapLabels: options.showBasemapLabels?.() ?? false,
      });
    }
    active.key = key;
  };
  const removeFrame = scene.layer.addBeforeRenderCallback?.(() => apply());

  let cancelRefinement: (() => void) | undefined;
  let lastRefinementAt = 0;
  const scheduleRefinement = () => {
    const pair = active;
    // Keep the outgoing snapshot stable in flight. The target may improve as
    // tiles arrive; one timer coalesces uploads without waiting for map idle.
    if (disposed || !pair || cancelRefinement) return;
    const nextItem = () =>
      pair.photos
        .slice()
        .reverse()
        .find(
          (item) =>
            item.dirty && item.stack && item.slot === 1 && !pair.neighbor
        );
    if (!nextItem()) return;
    const refine = () => {
      if (disposed || active !== pair) return;
      cancelRefinement = undefined;
      const item = nextItem();
      if (!item?.stack) return;
      item.dirty = false;
      const quality = readMosaicRegionQuality(
        item.stack,
        region(item),
        item.quality
      );
      if (quality) {
        try {
          draw(item, quality);
          map.triggerRepaint();
        } catch {
          // Retire a failed GPU composition; never publish a partially written target.
          for (const [key, cached] of pixels)
            if (cached.composer === item.composer) pixels.delete(key);
          cancel();
          return;
        }
      }
      lastRefinementAt = performance.now();
      scheduleRefinement();
    };
    const delay = Math.max(
      0,
      Math.ceil(REFINEMENT_INTERVAL_MS - (performance.now() - lastRefinementAt))
    );
    const timer = setTimeout(refine, delay);
    cancelRefinement = () => clearTimeout(timer);
  };

  const cancel = () => {
    cancelRefinement?.();
    cancelRefinement = undefined;
    const pair = active;
    active = null;
    if (!pair) return;
    clearTimeout(pair.finishedTimer);
    pair.cancelWait?.();
    for (const unsubscribe of pair.subscriptions) unsubscribe();
    for (const lease of pair.leases) lease.release();
    for (const name of ids) scene.layer.setMapStyleScreenOverlay?.(name, null);
    for (const item of pair.photos) {
      item.composer.attach(null);
      if (
        ![...pixels.values()].some(
          (cached) => cached.composer === item.composer
        )
      )
        disposePixels(item);
    }
    map.triggerRepaint();
  };

  const sourceOf = (photo: Photo) =>
    nativePreviewSource({
      imageId: photo.record.sourceId,
      path: photo.dataset.previewPath,
      sourceUrl: originalOf(photo) ?? pyramidOf(photo) ?? "",
      ...pyramidOptionsOf(photo),
      avifOnly: photo.dataset.avifOnly,
      nativeSize: {
        width: photo.calibration.widthPx as DevicePixels,
        height: photo.calibration.heightPx as DevicePixels,
      },
      minimumQualityLevel: photo.dataset.minimumPreviewQualityLevel,
    });
  const bufferSize = (native: { width: number; height: number }) => {
    const viewport = map.getCanvas();
    const gpuLimit =
      scene.layer.getRenderer?.()?.capabilities.maxTextureSize ?? Infinity;
    const scale = Math.min(
      1,
      viewport.width / native.width,
      viewport.height / native.height,
      gpuLimit / native.width,
      gpuLimit / native.height,
      Math.sqrt(PAIR_BYTES / (2 * 16 * native.width * native.height))
    );
    return {
      width: Math.max(1, Math.floor(native.width * scale)),
      height: Math.max(1, Math.floor(native.height * scale)),
    };
  };

  const pixelKey = (photo: Photo) => {
    const source = sourceOf(photo);
    return `${source.kind}:${source.url}:${photo.calibration.widthPx}x${photo.calibration.heightPx}`;
  };

  const snapshot = (
    photo: Photo,
    slot: 0 | 1,
    stack: ImageLevelStack | undefined,
    cached?: CachedPixels,
    view?: ImageView,
    freeze = slot === 0
  ): PreparedPhoto | undefined => {
    if (cached) {
      cached.composer.attach(freeze ? null : stack ?? null);
      return {
        ...cached,
        photo,
        slot,
        stack: freeze ? undefined : stack,
        projection: new Matrix4(),
        sourceProjection: new Matrix4(),
        cropMatrix: new Matrix4(),
        projectionDirty: true,
        dirty: false,
      };
    }
    if (
      !stack?.pyramid ||
      !stack.plan ||
      !stack.metrics.decodedBytes ||
      !scene.layer.getRenderer?.()
    )
      return;
    const crop = view?.visible;
    const size = bufferSize(crop ?? stack.pyramid.native);
    if (view) {
      const scale = Math.min(
        view.density,
        size.width / view.visible.width,
        size.height / view.visible.height
      );
      size.width = Math.max(1, Math.floor(view.visible.width * scale));
      size.height = Math.max(1, Math.floor(view.visible.height * scale));
    }
    if (slot === 1 && !view) trimPixels(size.width * size.height * 8);
    const composer = new ThreeImageLevels();
    composer.attach(stack);
    try {
      const rect = crop ?? {
        x: 0 as DevicePixels,
        y: 0 as DevicePixels,
        ...stack.pyramid.native,
      };
      const initial = composer.renderToTarget(
        scene.layer.getRenderer!()!,
        rect,
        size
      );
      if (!initial) {
        composer.dispose();
        return;
      }
      const item: PreparedPhoto = {
        photo,
        slot,
        texture: initial.texture,
        composer,
        size,
        textureRect: initial.rect,
        revision: initial.revision,
        projection: new Matrix4(),
        sourceProjection: new Matrix4(),
        cropMatrix: new Matrix4(),
        projectionDirty: true,
        stack: freeze ? undefined : stack,
        dirty: false,
        crop,
        quality: readMosaicRegionQuality(stack, rect) ?? undefined,
        minimumLevelWidth:
          slot === 1
            ? stack.pyramid.levels.find(
                (level) => level.level === stack.plan?.target
              )?.width ?? 0
            : 0,
      };
      // Keep outgoing/clicked snapshots immutable even if their pooled stack changes later.
      if (freeze) composer.attach(null);
      return item;
    } catch (error) {
      composer.dispose();
      throw error;
    }
  };

  return {
    prepareNeighbor(from, to, views) {
      if (
        disposed ||
        !removeFrame ||
        !scene.layer.setMapStyleScreenOverlay ||
        from.record.id === to.record.id ||
        !scene.layer.getLocalFrame() ||
        !scene.layer.projectSceneToLngLat([0, 0, 0])
      )
        return;
      const mesh = getSharedThreeSceneRuntimes(map).some((runtime) => {
        if (
          !runtime.mountsOnLocalFrame ||
          !(runtime.providesTerrain || runtime.receivesScreenImages) ||
          runtime.hasRenderableContent?.() !== true
        )
          return false;
        for (let object = runtime.root; object; object = object.parent!)
          if (!object.visible) return false;
        return true;
      });
      if (!mesh) return;
      const pair: NonNullable<typeof active> = {
        photos: [],
        leases: [],
        subscriptions: [],
        startBearing: 0 as Radians,
        bearingDelta: 0 as Radians,
        finished: false,
        sourceOnly: true,
        neighbor: true,
        key: "",
      };
      const cachedEntries: [string, PreparedPhoto][] = [];
      try {
        for (const [slot, photo, view] of [
          [0, from, views.sourceView],
          [1, to, views.targetView],
        ] as const) {
          const source = sourceOf(photo),
            stack = nativePixelPool.peek(source),
            crop = view.visible;
          if (
            !stack?.pyramid ||
            !stack.plan?.visibleTarget ||
            !stack.metrics.decodedBytes ||
            ![crop.x, crop.y, crop.width, crop.height, view.density].every(
              Number.isFinite
            ) ||
            crop.x < 0 ||
            crop.y < 0 ||
            crop.width <= 0 ||
            crop.height <= 0 ||
            view.density <= 0 ||
            crop.x + crop.width > photo.calibration.widthPx ||
            crop.y + crop.height > photo.calibration.heightPx
          )
            throw Error("Prepared neighbour pixels unavailable");
          // Use the same complete, drawable crop as landing preparation. The
          // snapshot can already show a coarse base while finer tiles arrive.
          if (residentPreviewLevel(stack, view) === undefined)
            throw Error("Incomplete neighbour coverage");
          const lease = nativePixelPool.acquire(source);
          pair.leases.push(lease);
          const key = `${pixelKey(photo)}:crop:${crop.x},${crop.y},${
            crop.width
          },${crop.height}:${view.density}`;
          const item = snapshot(
            photo,
            slot,
            lease.stack,
            cachedPixels(key),
            view,
            true
          );
          if (!item) throw Error("Neighbour snapshot unavailable");
          pair.photos.push(item);
          cachedEntries.push([key, item]);
        }
      } catch {
        for (const lease of pair.leases) lease.release();
        for (const item of pair.photos)
          if (
            ![...pixels.values()].some(
              (cached) => cached.composer === item.composer
            )
          )
            disposePixels(item);
        return;
      }
      // Snapshots own their composed pixels; keep the forecast source available for a new ROI.
      for (const lease of pair.leases) lease.release();
      pair.leases.length = 0;
      // Keep the previous underlay intact until both replacement snapshots exist.
      cancel();
      active = pair;
      for (const [key, item] of cachedEntries) {
        trimPixels(pixelBytes(item));
        pixels.set(key, cacheSnapshot(item));
      }
      apply();
      map.triggerRepaint();
      return {
        targetImageId: to.record.id,
        update() {
          if (active === pair) map.triggerRepaint();
        },
        handover() {
          if (active !== pair) return;
          pair.finished = true;
          apply();
          map.triggerRepaint();
        },
        finish() {
          if (active === pair) apply();
        },
        dispose() {
          if (active === pair) cancel();
        },
      };
    },
    async prepare(
      from,
      to,
      {
        sourceOnly = false,
        sourceView,
        requireSource = false,
        retainUntilReveal = false,
        decoration,
      } = {}
    ) {
      sourceOnly ||=
        from.record.id === to.record.id ||
        (!decoration &&
          Math.abs(
            headingDelta(
              degToRad(map.getBearing() as Degrees),
              degToRad(to.pose.bearingDeg as Degrees)
            )
          ) <= HEADING_EPSILON);
      cancel();
      if (
        disposed ||
        !removeFrame ||
        !scene.layer.setMapStyleScreenOverlay ||
        (!sourceOnly && from.record.id === to.record.id)
      )
        return;
      const mesh = getSharedThreeSceneRuntimes(map).some((runtime) => {
        const renderable = runtime.hasRenderableContent?.();
        if (
          !runtime.mountsOnLocalFrame ||
          !(runtime.providesTerrain || runtime.receivesScreenImages) ||
          (sourceOnly ? renderable !== true : renderable === false)
        )
          return false;
        for (let object = runtime.root; object; object = object.parent!)
          if (!object.visible) return false;
        return true;
      });
      if (
        !mesh ||
        (sourceOnly &&
          (!scene.layer.getLocalFrame() ||
            !scene.layer.projectSceneToLngLat([0, 0, 0])))
      )
        return;
      const pair: NonNullable<typeof active> = {
        photos: [],
        leases: [],
        subscriptions: [],
        startBearing: 0 as Radians,
        bearingDelta: 0 as Radians,
        finished: false,
        sourceOnly,
        decoration: decoration
          ? {
              backdropLook: decoration.backdropLook
                ? { ...decoration.backdropLook }
                : undefined,
              backdropTint: decoration.backdropTint
                ? [...decoration.backdropTint]
                : undefined,
            }
          : undefined,
        key: "",
      };
      active = pair;
      try {
        // Retain the outgoing preview without replacing its visible view or
        // starting a cold source. The target is foreground work in the same pool.
        const source = sourceOf(from);
        const cached = nativePixelPool.peek(source);
        const fromPixels = sourceView
          ? undefined
          : cachedPixels(
              pixelKey(from),
              bufferSize({
                width: from.calibration.widthPx,
                height: from.calibration.heightPx,
              })
            );
        const sourceResident =
          cached?.pyramid &&
          cached.plan?.layers.some((index) => {
            const level = cached.pyramid!.levels.find(
              (level) => level.level === index
            );
            if (!level) return false;
            if (!sourceView) return hasWholeLevel(cached, index);
            const range = tileRangeFor(
              level,
              cached.pyramid!.native,
              sourceView.visible
            );
            if (range.col0 >= range.col1 || range.row0 >= range.row1)
              return false;
            for (let row = range.row0; row < range.row1; row++)
              for (let col = range.col0; col < range.col1; col++)
                if (!cached.isResident(index, col, row)) return false;
            return true;
          });
        if ((sourceOnly || requireSource) && !fromPixels && !sourceResident) {
          cancel();
          return;
        }
        const fromLease = cached?.metrics.decodedBytes
          ? nativePixelPool.acquire(source)
          : undefined;
        if (fromLease) pair.leases.push(fromLease);
        let toLease: ImageLevelStackLease | undefined;
        let targetPixels: CachedPixels | undefined;
        let targetKey = "";
        if (!sourceOnly) {
          const targetSource = sourceOf(to);
          const size = bufferSize({
            width: to.calibration.widthPx,
            height: to.calibration.heightPx,
          });
          targetKey = pixelKey(to);
          targetPixels = cachedPixels(targetKey, size);
          // Reuse a composed preview immediately, while its requested display
          // resolution continues loading even after native-stack eviction.
          toLease = nativePixelPool.acquire(targetSource);
          pair.leases.push(toLease);
          const stack = toLease.stack;
          const targetView: ImageView = {
            visible: {
              x: 0 as DevicePixels,
              y: 0 as DevicePixels,
              width: to.calibration.widthPx as DevicePixels,
              height: to.calibration.heightPx as DevicePixels,
            },
            density: (size.width / to.calibration.widthPx) as Ratio,
          };
          stack.setView(targetView, size.width * size.height);
          const ready =
            targetPixels ||
            (await new Promise<boolean>((resolve) => {
              let settled = false;
              let unsubscribe = () => {};
              let timer: ReturnType<typeof setTimeout> | undefined;
              const finish = (value: boolean) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                unsubscribe();
                pair.cancelWait = undefined;
                resolve(value);
              };
              const check = () => {
                if (stack.error || active !== pair) finish(false);
                else if (residentPreviewLevel(stack, targetView) !== undefined)
                  finish(true);
              };
              pair.cancelWait = () => finish(false);
              unsubscribe = stack.subscribe(check);
              timer = setTimeout(() => finish(false), PREPARE_TIMEOUT_MS);
              void stack.ready.then(check, () => finish(false));
              check();
            }));
          if (active !== pair) return;
          if (
            !ready ||
            (!targetPixels &&
              residentPreviewLevel(stack, targetView) === undefined)
          ) {
            cancel();
            return;
          }
        }
        for (const [slot, photo, lease] of [
          [0, from, fromLease],
          [1, to, toLease],
        ] as const) {
          const composed = slot === 0 ? fromPixels : targetPixels;
          if (!lease && !composed) continue;
          let item: PreparedPhoto | undefined;
          try {
            item = snapshot(
              photo,
              slot,
              lease?.stack,
              composed,
              slot === 0 ? sourceView : undefined
            );
          } catch {
            if (slot === 1) throw new Error("Target drape unavailable");
          }
          if (!item) {
            if (slot === 1) {
              cancel();
              return;
            }
            continue;
          }
          pair.photos.push(item);
          // A cached target can already have newer resident tiles before the
          // content subscription is installed. Compare it once asynchronously.
          if (slot === 1 && lease) item.dirty = true;
          if (slot === 1 && !targetPixels) {
            const previous = pixels.get(targetKey);
            if (
              previous &&
              !pair.photos.some((entry) => entry.composer === previous.composer)
            )
              disposePixels(previous);
            pixels.set(targetKey, cacheSnapshot(item));
          }
          const prepared = item;
          if (lease && slot === 1)
            pair.subscriptions.push(
              lease.stack.onContentChange(() => {
                if (active !== pair) return;
                prepared.dirty = true;
                scheduleRefinement();
              })
            );
        }
      } catch {
        if (active === pair) cancel();
        return;
      }
      if (
        !pair.photos.length ||
        (requireSource && !pair.photos.some((photo) => photo.slot === 0))
      ) {
        cancel();
        return;
      }
      if (!sourceOnly) {
        pair.startBearing = degToRad(map.getBearing() as Degrees);
        pair.bearingDelta = headingDelta(
          pair.startBearing,
          degToRad(to.pose.bearingDeg as Degrees)
        );
      }
      apply();
      scheduleRefinement();
      map.triggerRepaint();
      return {
        targetImageId: to.record.id,
        update(progress) {
          if (active !== pair) return;
          if (
            Math.abs(pair.bearingDelta) <= HEADING_EPSILON &&
            Number.isFinite(progress)
          )
            pair.fallbackProgress = Math.max(0, Math.min(1, progress));
          map.triggerRepaint();
        },
        reveal() {
          if (active !== pair) return;
          pair.revealing = true;
          apply();
          map.triggerRepaint();
        },
        finish() {
          if (active !== pair) return;
          pair.finished = true;
          apply();
          scheduleRefinement();
          // Seamless navigation explicitly disposes this source when the target
          // flat preview is ready. It must not disappear on a heading or timer.
          if (!sourceOnly && !retainUntilReveal) {
            clearTimeout(pair.finishedTimer);
            pair.finishedTimer = setTimeout(() => {
              if (active === pair) cancel();
            }, 750);
          }
          map.triggerRepaint();
        },
        dispose() {
          if (active === pair) cancel();
        },
      };
    },
    cancel,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
      for (const item of pixels.values()) disposePixels(item);
      pixels.clear();
      removeFrame?.();
      scene.release();
    },
  };
};
