import type { Map as MaplibreMap } from "maplibre-gl";
import { ImageViewportPool, type ImageViewportHandle, type ImageViewportSnapshot } from "@carma-commons/image-streaming";
import { acquireSharedThreeScene, getSharedThreeSceneRuntimes } from "@carma-mapping/engines/maplibre";
import { LinearFilter, Matrix3, Matrix4, SRGBColorSpace, Texture } from "three";
import type { DevicePixels } from "@carma-units";
import { imageProjectionMatrix, sceneToPhotoEnu } from "../../core/utils/image-projection";
import type { ScenePreviewPhoto } from "../hooks/useScenePreviewImage";
import { viewportSourceOf, type ObliqueViewportPhoto } from "./oblique-viewport-source";

const PAIR_BYTES = 128 * 1024 * 1024;
const PREPARE_TIMEOUT_MS = 2000;
let nextPairId = 0;

type Photo = ScenePreviewPhoto & ObliqueViewportPhoto;
type PreparedPhoto = {
  photo: Photo;
  handle: ImageViewportHandle;
  texture: Texture;
  bitmap: ImageBitmap;
  unsubscribe: () => void;
  projection: Matrix4;
};
export type PhotoRotationDrapeTransition = {
  targetImageId: string;
  update: (progress: number) => void;
  finish: () => void;
  dispose: () => void;
};
export type PhotoRotationDrape = {
  prepare: (from: Photo, to: Photo) => Promise<PhotoRotationDrapeTransition | undefined>;
  cancel: () => void;
  dispose: () => void;
};

/** Borrow bounded streamed bitmaps; only two GPU textures exist for the current transition. */
export const createPhotoRotationDrape = (
  map: MaplibreMap,
  options: { showBasemapLabels?: () => boolean } = {}
): PhotoRotationDrape => {
  const scene = acquireSharedThreeScene(map);
  const pool = new ImageViewportPool({ maxImages: 2, maxBytes: PAIR_BYTES, retainedSourceBytes: 2 * 1024 * 1024 });
  const id = `oblique-rotation-photo-${++nextPairId}`;
  const ids = [`${id}-from`, `${id}-to`];
  const identity = new Matrix3();
  let pending: AbortController | null = null;
  let active: { photos: PreparedPhoto[]; progress: number; key: string; painted?: () => void; finishedTimer?: ReturnType<typeof setTimeout> } | null = null;
  let disposed = false;

  const apply = () => {
    if (!active) return;
    const frame = scene.layer.getLocalFrame();
    const origin = scene.layer.projectSceneToLngLat([0, 0, 0]);
    if (!frame || !origin) return;
    const key = `${origin[0]},${origin[1]}:${frame.sceneFromLocal.elements.join(",")}`;
    const reproject = active.key !== key;
    for (const [index, item] of active.photos.entries()) {
      if (reproject) item.projection.copy(imageProjectionMatrix(
        item.photo.record, item.photo.calibration, item.photo.pose,
        sceneToPhotoEnu(origin, frame.sceneFromLocal, item.photo.pose, item.photo.altitude)
      ));
      scene.layer.setMapStyleScreenOverlay?.(ids[index], {
        texture: item.texture,
        viewportToTexture: identity,
        projective: { sceneToTexture: item.projection },
        opacity: index === 0 ? 1 - active.progress : active.progress,
        priority: 100 + index,
        showBasemapLabels: options.showBasemapLabels?.() ?? false,
      });
    }
    active.key = key;
    active.painted?.();
    active.painted = undefined;
  };
  const removeFrame = scene.layer.addBeforeRenderCallback?.(apply);

  const cancel = () => {
    pending?.abort(); pending = null;
    const pair = active; active = null;
    if (!pair) return;
    clearTimeout(pair.finishedTimer);
    pair.painted?.();
    for (const name of ids) scene.layer.setMapStyleScreenOverlay?.(name, null);
    for (const item of pair.photos) {
      item.unsubscribe();
      item.texture.dispose();
      item.handle.release();
    }
    map.triggerRepaint();
  };

  const load = (photo: Photo, signal: AbortSignal): Promise<PreparedPhoto | undefined> => {
    const source = { ...viewportSourceOf(photo), flipForTexture: true };
    const canvas = map.getCanvas();
    const physicalWidth = Math.max(1, canvas.width), physicalHeight = Math.max(1, canvas.height);
    const maxPixels = Math.min(physicalWidth * physicalHeight, PAIR_BYTES / (2 * 16));
    const scale = Math.min(physicalWidth / source.nativeSize.width, physicalHeight / source.nativeSize.height,
      Math.sqrt(maxPixels / (source.nativeSize.width * source.nativeSize.height)), source.maxSourceDensity ?? 1);
    const target = { width: Math.max(1, Math.floor(source.nativeSize.width * scale)) as DevicePixels,
      height: Math.max(1, Math.floor(source.nativeSize.height * scale)) as DevicePixels };
    const handle = pool.acquire(source);
    try {
      handle.setViewport({ source: { x: 0 as DevicePixels, y: 0 as DevicePixels, ...source.nativeSize }, target });
    } catch {
      handle.release();
      return Promise.resolve(undefined);
    }
    return new Promise(resolve => {
      let item: PreparedPhoto | undefined;
      let complete = false;
      let unsubscribe = () => {};
      const clean = () => { unsubscribe(); signal.removeEventListener("abort", aborted); };
      const done = (result?: PreparedPhoto) => {
        if (complete) return;
        complete = true; clearTimeout(timeout);
        if (!result) { clean(); item?.texture.dispose(); handle.release(); }
        resolve(result);
      };
      const aborted = () => done();
      const timeout = setTimeout(() => done(), PREPARE_TIMEOUT_MS);
      signal.addEventListener("abort", aborted, { once: true });
      if (signal.aborted) { done(); return; }
      const accept = (snapshot: ImageViewportSnapshot) => {
        if (signal.aborted || snapshot.error) { done(); return; }
        const bitmap = snapshot.bitmap, frame = snapshot.frame;
        if (!bitmap || !frame || frame.source.x > 0 || frame.source.y > 0 ||
          frame.source.width < source.nativeSize.width || frame.source.height < source.nativeSize.height) return;
        if (!item) {
          const texture = new Texture(bitmap);
          texture.colorSpace = SRGBColorSpace; texture.flipY = false;
          texture.minFilter = LinearFilter; texture.magFilter = LinearFilter; texture.generateMipmaps = false;
          texture.needsUpdate = true;
          item = { photo, handle, texture, bitmap, unsubscribe: clean, projection: new Matrix4() };
        } else if (item.bitmap !== bitmap) {
          item.bitmap = bitmap; item.texture.image = bitmap; item.texture.needsUpdate = true;
          map.triggerRepaint();
        }
        const input = snapshot.input;
        const neededX = target.width / source.nativeSize.width;
        const neededY = target.height / source.nativeSize.height;
        const readyX = input ? input.width / source.nativeSize.width : bitmap.width / frame.source.width;
        const readyY = input ? input.height / source.nativeSize.height : bitmap.height / frame.source.height;
        if (!snapshot.loading && bitmap.width + 1 >= target.width && bitmap.height + 1 >= target.height &&
            readyX + 1 / source.nativeSize.width >= neededX && readyY + 1 / source.nativeSize.height >= neededY)
          done(item);
      };
      try { unsubscribe = handle.subscribe(accept); } catch { done(); }
      if (complete && !item) clean();
    });
  };

  return {
    async prepare(from, to) {
      cancel();
      if (disposed || !removeFrame || !scene.layer.setMapStyleScreenOverlay || from.record.id === to.record.id) return;
      const mesh = getSharedThreeSceneRuntimes(map).some(runtime => {
        if (!runtime.mountsOnLocalFrame || !runtime.providesTerrain ||
            runtime.mapStyleProjectionBlend === "replace" || runtime.hasRenderableContent?.() === false) return false;
        for (let object = runtime.root; object; object = object.parent!) if (!object.visible) return false;
        return true;
      });
      if (!mesh) return;
      const controller = new AbortController(); pending = controller;
      const results = await Promise.allSettled([
        Promise.resolve().then(() => load(from, controller.signal)),
        Promise.resolve().then(() => load(to, controller.signal)),
      ]);
      const photos = results.flatMap(result => result.status === "fulfilled" && result.value ? [result.value] : []);
      if (controller.signal.aborted || pending !== controller || photos.length !== 2) {
        for (const item of photos) { item.unsubscribe(); item.texture.dispose(); item.handle.release(); }
        if (pending === controller) pending = null;
        return;
      }
      pending = null;
      const pair = { photos, progress: 0, key: "", painted: undefined as (() => void) | undefined,
        finishedTimer: undefined as ReturnType<typeof setTimeout> | undefined };
      active = pair;
      await new Promise<void>(resolve => {
        pair.painted = resolve;
        pair.finishedTimer = setTimeout(resolve, 150);
        map.triggerRepaint();
      });
      clearTimeout(pair.finishedTimer); pair.finishedTimer = undefined;
      if (active !== pair) return;
      if (!pair.key) { cancel(); return; }
      return {
        targetImageId: to.record.id,
        update(progress) { if (active === pair) { pair.progress = Math.max(0, Math.min(1, progress)); apply(); } },
        finish() {
          if (active !== pair) return;
          pair.progress = 1; apply();
          // The target's ordinary bounded preview gets the next frame to take over.
          pair.finishedTimer = setTimeout(() => { if (active === pair) cancel(); }, 750);
          map.triggerRepaint();
        },
        dispose() { if (active === pair) cancel(); },
      };
    },
    cancel,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel(); removeFrame?.(); pool.dispose(); scene.release();
    },
  };
};
