import type { Map as MaplibreMap } from "maplibre-gl";
import {
  drawImageLevels,
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
import {
  acquireSharedThreeScene,
  getSharedThreeSceneRuntimes,
} from "@carma-mapping/engines/maplibre";
import { LinearFilter, Matrix3, Matrix4, SRGBColorSpace, Texture } from "three";
import {
  imageProjectionMatrix,
  sceneToPhotoEnu,
} from "../../core/utils/image-projection";
import type { ScenePreviewPhoto } from "../hooks/useScenePreviewImage";
import {
  originalOf,
  pyramidOf,
  type ObliqueViewportPhoto,
} from "./oblique-viewport-source";

// Includes two RGBA canvases, their GPU copies and upload/draw headroom.
const PAIR_BYTES = 512 * 1024 * 1024;
// Four visited directions retain only composed RGBA canvas/GPU pixels, not
// native decoded stacks. The pair's transient upload budget remains separate.
const CACHE_BYTES = 512 * 1024 * 1024;
const CACHE_IMAGES = 4;
const PREPARE_TIMEOUT_MS = 30000;
const HEADING_EPSILON = degToRad(0.000001 as Degrees);
let nextPairId = 0;

const headingDelta = (from: Radians, to: Radians): Radians => {
  const delta = negativePiToPi((to - from) as Radians);
  // Match flyToImage's negative-direction tie break for an exact half turn.
  return delta === PI ? (-PI as Radians) : delta;
};

type Photo = ScenePreviewPhoto & ObliqueViewportPhoto;
type CachedPixels = {
  texture: Texture;
  canvas: OffscreenCanvas;
  context: OffscreenCanvasRenderingContext2D;
  minimumLevelWidth: number;
};
type PreparedPhoto = {
  photo: Photo;
  slot: 0 | 1;
  texture: Texture;
  canvas: OffscreenCanvas;
  projection: Matrix4;
  stack: ImageLevelStack;
  context: OffscreenCanvasRenderingContext2D;
  dirty: boolean;
  minimumLevelWidth: number;
};
export type PhotoRotationDrapeTransition = {
  targetImageId: string;
  update: (progress: number) => void;
  finish: () => void;
  dispose: () => void;
};
export type PhotoRotationDrape = {
  prepare: (
    from: Photo,
    to: Photo
  ) => Promise<PhotoRotationDrapeTransition | undefined>;
  cancel: () => void;
  dispose: () => void;
};

/** Prepare a complete landing photo, retaining shared pixels throughout the blend. */
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
    finished: boolean;
    key: string;
    finishedTimer?: ReturnType<typeof setTimeout>;
  } | null = null;
  let disposed = false;
  const pixels = new Map<string, CachedPixels>();
  const disposePixels = (item: Pick<CachedPixels, "texture" | "canvas">) => {
    item.texture.dispose();
    item.canvas.width = item.canvas.height = 1;
  };
  const cacheBytes = () =>
    [...pixels.values()].reduce(
      (bytes, item) => bytes + item.canvas.width * item.canvas.height * 8,
      0
    );
  const trimPixels = (incomingBytes = 0) => {
    for (const [key, item] of pixels) {
      if (
        pixels.size < CACHE_IMAGES &&
        cacheBytes() + incomingBytes <= CACHE_BYTES
      )
        break;
      if (active?.photos.some((photo) => photo.texture === item.texture))
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
        (item.canvas.width < size.width || item.canvas.height < size.height))
    )
      return;
    pixels.delete(key);
    pixels.set(key, item);
    return item;
  };

  const draw = (item: PreparedPhoto) => {
    drawImageLevels(
      item.context,
      item.stack,
      {
        originX: 0,
        originY: 0,
        scale: item.canvas.width / item.stack.pyramid!.native.width,
      },
      item.canvas
    );
    item.texture.needsUpdate = true;
    item.dirty = false;
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
  const completeTarget = (stack: ImageLevelStack) => {
    const range = stack.plan?.visibleTarget;
    const level = stack.pyramid?.levels.find(
      (candidate) => candidate.level === range?.level
    );
    return (
      !!range &&
      !!level &&
      range.col0 === 0 &&
      range.row0 === 0 &&
      range.col1 === level.cols &&
      range.row1 === level.rows &&
      stack.visibleReady &&
      hasWholeLevel(stack, range.level)
    );
  };

  const apply = (refreshPixels = false) => {
    if (!active?.photos.length) return;
    const frame = scene.layer.getLocalFrame();
    const origin = scene.layer.projectSceneToLngLat([0, 0, 0]);
    if (!frame || !origin) return;
    const key = `${origin[0]},${origin[1]}:${frame.sceneFromLocal.elements.join(
      ","
    )}`;
    const reproject = active.key !== key;
    const travelled = headingDelta(
      active.startBearing,
      degToRad(map.getBearing() as Degrees)
    );
    // Heading, not animation time, decides the hard cut. Equal headings keep
    // the source until finish; travelling the opposite way does not count.
    const showTarget =
      active.finished ||
      (Math.abs(active.bearingDelta) > HEADING_EPSILON &&
        Math.sign(active.bearingDelta) * travelled >=
          Math.abs(active.bearingDelta) / 2 - HEADING_EPSILON);
    for (const item of active.photos) {
      const index = item.slot;
      if (refreshPixels && item.dirty) {
        // Eviction alone must not erase the previous projection. Try again
        // only when another content notification signals changed residency.
        item.dirty = false;
        if (
          item.stack.pyramid &&
          item.stack.plan?.layers.some(
            (index) =>
              (item.stack.pyramid?.levels.find((level) => level.level === index)
                ?.width ?? 0) >= item.minimumLevelWidth &&
              hasWholeLevel(item.stack, index)
          )
        ) {
          try {
            draw(item);
          } catch {
            // A failed draw may have cleared this canvas already. Never reuse
            // it as a complete photo on the next visit.
            for (const [key, cached] of pixels)
              if (cached.texture === item.texture) pixels.delete(key);
            cancel();
            return;
          }
        }
      }
      if (reproject)
        item.projection.copy(
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
      scene.layer.setMapStyleScreenOverlay?.(ids[index], {
        texture: item.texture,
        viewportToTexture: identity,
        projective: { sceneToTexture: item.projection },
        opacity: index === (showTarget ? 1 : 0) ? 1 : 0,
        priority: 100 + index,
        showBasemapLabels: options.showBasemapLabels?.() ?? false,
      });
    }
    active.key = key;
  };
  const removeFrame = scene.layer.addBeforeRenderCallback?.(() => apply(true));

  const cancel = () => {
    const pair = active;
    active = null;
    if (!pair) return;
    clearTimeout(pair.finishedTimer);
    pair.cancelWait?.();
    for (const unsubscribe of pair.subscriptions) unsubscribe();
    for (const lease of pair.leases) lease.release();
    for (const name of ids) scene.layer.setMapStyleScreenOverlay?.(name, null);
    for (const item of pair.photos) {
      if (
        ![...pixels.values()].some((cached) => cached.texture === item.texture)
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
      avifPyramidUrl: pyramidOf(photo),
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
      (2 * viewport.width) / native.width,
      (2 * viewport.height) / native.height,
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
    stack: ImageLevelStack,
    cached?: CachedPixels
  ): PreparedPhoto | undefined => {
    if (cached)
      return {
        ...cached,
        photo,
        slot,
        stack,
        projection: new Matrix4(),
        dirty: false,
      };
    if (!stack.pyramid || !stack.plan || !stack.metrics.decodedBytes) return;
    const size = bufferSize(stack.pyramid.native);
    if (slot === 1) trimPixels(size.width * size.height * 8);
    const canvas = new OffscreenCanvas(size.width, size.height);
    const context = canvas.getContext("2d");
    if (!context) {
      canvas.width = canvas.height = 1;
      return;
    }
    const texture = new Texture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.flipY = true;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.generateMipmaps = false;
    const item = {
      photo,
      slot,
      texture,
      canvas,
      projection: new Matrix4(),
      stack,
      context,
      dirty: true,
      minimumLevelWidth:
        slot === 1
          ? stack.pyramid.levels.find(
              (level) => level.level === stack.plan?.target
            )?.width ?? 0
          : 0,
    };
    try {
      draw(item);
    } catch (error) {
      texture.dispose();
      canvas.width = canvas.height = 1;
      throw error;
    }
    return item;
  };

  return {
    async prepare(from, to) {
      cancel();
      if (
        disposed ||
        !removeFrame ||
        !scene.layer.setMapStyleScreenOverlay ||
        from.record.id === to.record.id
      )
        return;
      const mesh = getSharedThreeSceneRuntimes(map).some((runtime) => {
        if (
          !runtime.mountsOnLocalFrame ||
          !runtime.providesTerrain ||
          runtime.hasRenderableContent?.() === false
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
        key: "",
      };
      active = pair;
      try {
        // Retain the outgoing preview without replacing its visible view or
        // starting a cold source. The target is foreground work in the same pool.
        const source = sourceOf(from);
        const cached = nativePixelPool.peek(source);
        const fromPixels = cachedPixels(pixelKey(from));
        const fromLease =
          cached?.metrics.decodedBytes || fromPixels
            ? nativePixelPool.acquire(source)
            : undefined;
        if (fromLease) pair.leases.push(fromLease);
        const toLease = nativePixelPool.acquire(sourceOf(to));
        pair.leases.push(toLease);
        const stack = toLease.stack;
        const size = bufferSize({
          width: to.calibration.widthPx,
          height: to.calibration.heightPx,
        });
        const targetKey = pixelKey(to);
        const targetPixels = cachedPixels(targetKey, size);
        if (!targetPixels)
          stack.setView(
            {
              visible: {
                x: 0 as DevicePixels,
                y: 0 as DevicePixels,
                width: to.calibration.widthPx as DevicePixels,
                height: to.calibration.heightPx as DevicePixels,
              },
              density: (size.width / to.calibration.widthPx) as Ratio,
            },
            size.width * size.height
          );
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
              else if (completeTarget(stack)) finish(true);
            };
            pair.cancelWait = () => finish(false);
            unsubscribe = stack.subscribe(check);
            timer = setTimeout(() => finish(false), PREPARE_TIMEOUT_MS);
            void stack.ready.then(check, () => finish(false));
            check();
          }));
        if (active !== pair) return;
        if (!ready || (!targetPixels && !completeTarget(stack))) {
          cancel();
          return;
        }
        for (const [slot, photo, lease] of [
          [0, from, fromLease],
          [1, to, toLease],
        ] as const) {
          if (!lease) continue;
          let item: PreparedPhoto | undefined;
          try {
            item = snapshot(
              photo,
              slot,
              lease.stack,
              slot === 0 ? fromPixels : targetPixels
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
          if (slot === 1 && !targetPixels) {
            const previous = pixels.get(targetKey);
            if (
              previous &&
              !pair.photos.some((entry) => entry.texture === previous.texture)
            )
              disposePixels(previous);
            pixels.set(targetKey, {
              texture: item.texture,
              canvas: item.canvas,
              context: item.context,
              minimumLevelWidth: item.minimumLevelWidth,
            });
          }
          const prepared = item;
          pair.subscriptions.push(
            lease.stack.onContentChange(() => {
              if (active !== pair) return;
              prepared.dirty = true;
              map.triggerRepaint();
            })
          );
        }
      } catch {
        if (active === pair) cancel();
        return;
      }
      pair.startBearing = degToRad(map.getBearing() as Degrees);
      pair.bearingDelta = headingDelta(
        pair.startBearing,
        degToRad(to.pose.bearingDeg as Degrees)
      );
      apply();
      map.triggerRepaint();
      return {
        targetImageId: to.record.id,
        update(_progress) {
          if (active === pair) apply();
        },
        finish() {
          if (active !== pair) return;
          pair.finished = true;
          apply();
          // The target's ordinary bounded preview gets the next frame to take over.
          clearTimeout(pair.finishedTimer);
          pair.finishedTimer = setTimeout(() => {
            if (active === pair) cancel();
          }, 750);
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
