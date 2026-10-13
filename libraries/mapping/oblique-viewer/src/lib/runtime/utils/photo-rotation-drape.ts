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
import { previewSceneToClip } from "./prepare-preview-flight";
import {
  acquireSharedThreeScene,
  getSharedThreeSceneRuntimes,
  type MapStyleScreenOverlay,
  type MapStylePhotoMosaicEntry,
} from "@carma-mapping/engines/maplibre";
import {
  DataTexture,
  Matrix3,
  Matrix4,
  RGBAFormat,
  UnsignedByteType,
  Vector3,
  type Texture,
} from "three";
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
type MutableMapStyleScreenOverlay = {
  -readonly [Key in keyof MapStyleScreenOverlay]: MapStyleScreenOverlay[Key];
};
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
  capturePosition?: Vector3;
  sceneToMetric?: Matrix4;
  stack?: ImageLevelStack;
  dirty: boolean;
};
type DecorationPair = {
  from: Photo;
  to: Photo;
  sourceProjection: Matrix4 | null;
  targetProjection: Matrix4 | null;
  originLongitude?: number;
  originLatitude?: number;
  localFrameElements?: number[];
  lastMix?: number;
  lastOpacity?: number;
  lastShowBasemapLabels?: boolean;
  lastRevealing?: boolean;
  startBearing: Radians;
  bearingDelta: Radians;
  fallbackProgress?: number;
  finished: boolean;
  revealing?: boolean;
  decoration: DrapeDecoration;
  decorationOpacity?: () => number;
  sourceOnly: boolean;
  overlays: [MutableMapStyleScreenOverlay, MutableMapStyleScreenOverlay];
};
export type PhotoRotationDrapeTransition = {
  targetImageId: string;
  update: (progress: number) => void;
  finish: () => void;
  /** Freeze auxiliary captures on the solved orbit; never change the camera path. */
  prepareViews?: (frames: readonly MaplibreMap["transform"][]) => void;
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
      auxiliary?: readonly Photo[];
      auxiliaryExpected?: number;
      sourceView?: ImageView;
      requireSource?: boolean;
      retainUntilReveal?: boolean;
      decoration?: DrapeDecoration;
      /** Publish only calibrated full-sensor matte contours; never touch image pixels. */
      decorationOnly?: boolean;
      /** Sample opacity for the matte and contours on each renderer frame. */
      decorationOpacity?: () => number;
    }
  ) => Promise<PhotoRotationDrapeTransition | undefined>;
  cancel: () => void;
  dispose: () => void;
};

/** Retain calibrated pixels for rotation, or publish calibrated matte contours only. */
export const createPhotoRotationDrape = (
  map: MaplibreMap,
  options: {
    showBasemapLabels?: () => boolean;
    /** Suppress only synthetic repair; retain real-photo union and angular coverage. */
    gapFillEnabled?: () => boolean;
  } = {}
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
    auxiliaryExpected?: number;
    auxiliary?: PreparedPhoto[];
    auxiliaryWaiting?: {
      photo: Photo;
      stack?: ImageLevelStack;
      view: ImageView;
    }[];
    auxiliaryEntries?: MapStylePhotoMosaicEntry[];
    gapRepair?: {
      auxiliaryExpected?: number;
      auxiliary?: readonly MapStylePhotoMosaicEntry[];
      id: string;
      sceneToMetric: Matrix4;
      views: readonly Matrix4[];
    };
    finishedTimer?: ReturnType<typeof setTimeout>;
  } | null = null;
  let decorationPair: DecorationPair | null = null;
  let matteTexture: DataTexture | null = null;
  let disposed = false;
  let gapGeneration = 0;
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
    if (decorationPair) {
      applyDecorationPair();
      return;
    }
    if (!active?.photos.length) return;
    const frame = scene.layer.getLocalFrame();
    const origin = scene.layer.projectSceneToLngLat([0, 0, 0]);
    if (!frame || !origin) return;
    for (const waiting of active.auxiliaryWaiting ?? []) {
      if (
        !waiting.stack ||
        active.auxiliary?.some(
          (item) => item.photo.record.id === waiting.photo.record.id
        )
      )
        continue;
      if (residentPreviewLevel(waiting.stack, waiting.view) === undefined)
        continue;
      const item = snapshot(
        waiting.photo,
        0,
        waiting.stack,
        undefined,
        waiting.view
      );
      if (item) (active.auxiliary ??= []).push(item);
    }
    const key = `${origin[0]},${origin[1]}:${frame.sceneFromLocal.elements.join(
      ","
    )}`;
    const reproject = active.key !== key;
    if (reproject && active.gapRepair) {
      const anchor = active.photos[0]?.photo;
      if (anchor)
        active.gapRepair.sceneToMetric.copy(
          sceneToPhotoEnu(origin, frame.sceneFromLocal, anchor.pose, 0)
        );
    }
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
    if (active.gapRepair) {
      active.gapRepair.auxiliaryExpected = active.auxiliaryExpected ?? 0;
      active.gapRepair.auxiliary = active.auxiliaryEntries ?? [];
    }
    for (const item of [...active.photos, ...(active.auxiliary ?? [])]) {
      // Reserve one slot for the arriving flat photo, retaining the target
      // projection, matte and contour until that photo is actually published.
      const index = active.revealing ? 0 : item.slot;
      if (reproject || !item.capturePosition) {
        const toPhotoEnu = sceneToPhotoEnu(
          origin,
          frame.sceneFromLocal,
          item.photo.pose,
          item.photo.altitude
        );
        item.sceneToMetric = toPhotoEnu;
        (item.capturePosition ??= new Vector3())
          .set(0, 0, 0)
          .applyMatrix4(toPhotoEnu.clone().invert());
        item.sourceProjection.copy(
          imageProjectionMatrix(
            item.photo.record,
            item.photo.calibration,
            item.photo.pose,
            toPhotoEnu
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
      if (active.auxiliary?.includes(item)) continue;
      if (
        (active.neighbor && index !== (showTarget ? 1 : 0)) ||
        (active.revealing &&
          item.slot !== (active.sourceOnly || !active.decoration ? 0 : 1))
      ) {
        if (!active.revealing)
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
          gapRepair:
            index === 0 &&
            !active.revealing &&
            (options.gapFillEnabled?.() ?? true)
              ? active.gapRepair
              : undefined,
          // Keep the completed target contour through flat-photo publication.
          frame: decoration
            ? {
                opacity: 0.9 * opacity,
                coverageOpacity: opacity,
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
    if (active.revealing) scene.layer.setMapStyleScreenOverlay?.(ids[1], null);
    const completeGroup =
      !active.neighbor &&
      !active.sourceOnly &&
      !active.revealing &&
      active.photos.length === 2 &&
      (active.auxiliary?.length ?? 0) === (active.auxiliaryExpected ?? 0);
    const group = completeGroup
      ? [...active.photos, ...(active.auxiliary ?? [])]
      : [];
    const entries = group.map((item, index) => ({
      texture: item.texture,
      textureRevision: item.revision,
      sceneToTexture: item.projection,
      sourceProjection: item.sourceProjection,
      opacity: 1,
      // Actual receiver angles compete in GPU depth. Stable capture order
      // resolves exact ties without heading-driven sort/publication churn.
      priority: 1000 + index,
      navigationGroup: true,
      capturePosition: item.capturePosition!,
      sceneToMetric:
        active.gapRepair?.sceneToMetric ?? active.photos[0].sceneToMetric!,
    }));
    scene.layer.setMapStylePhotoMosaic?.(
      `${id}-group`,
      entries.length ? entries : null
    );
    active.auxiliaryEntries = entries.filter((entry) =>
      active.auxiliary?.some((item) => item.texture === entry.texture)
    );
    if (active.gapRepair) {
      active.gapRepair.auxiliaryExpected = active.auxiliaryExpected ?? 0;
      active.gapRepair.auxiliary = active.auxiliaryEntries;
      // Publish the complete group only after its extra projectors are ready.
      // The next frame transfers the same generation with no camera/owner reset.
    }
    active.key = key;
  };

  function applyDecorationPair() {
    const pair = decorationPair;
    if (!pair || !matteTexture) return;
    const frame = scene.layer.getLocalFrame();
    const origin = scene.layer.projectSceneToLngLat([0, 0, 0]);
    if (!frame || !origin) return;
    const elements = frame.sceneFromLocal.elements;
    let projectionChanged =
      pair.sourceProjection === null ||
      pair.originLongitude !== origin[0] ||
      pair.originLatitude !== origin[1] ||
      pair.localFrameElements === undefined;
    if (!projectionChanged) {
      const previous = pair.localFrameElements!;
      for (let index = 0; index < 16; index++) {
        if (previous[index] !== elements[index]) {
          projectionChanged = true;
          break;
        }
      }
    }
    if (projectionChanged) {
      pair.sourceProjection = imageProjectionMatrix(
        pair.from.record,
        pair.from.calibration,
        pair.from.pose,
        sceneToPhotoEnu(
          origin,
          frame.sceneFromLocal,
          pair.from.pose,
          pair.from.altitude
        )
      );
      pair.targetProjection = imageProjectionMatrix(
        pair.to.record,
        pair.to.calibration,
        pair.to.pose,
        sceneToPhotoEnu(
          origin,
          frame.sceneFromLocal,
          pair.to.pose,
          pair.to.altitude
        )
      );
      pair.originLongitude = origin[0];
      pair.originLatitude = origin[1];
      pair.localFrameElements = Array.from(elements);
    }
    const travelled = headingDelta(
      pair.startBearing,
      degToRad(map.getBearing() as Degrees)
    );
    const mix = pair.sourceOnly
      ? 0
      : pair.finished
      ? 1
      : Math.abs(pair.bearingDelta) > HEADING_EPSILON
      ? Math.max(0, Math.min(1, travelled / pair.bearingDelta))
      : pair.fallbackProgress ?? 0;
    const sampledOpacity = pair.decorationOpacity?.() ?? 1;
    const decorationOpacity = Number.isFinite(sampledOpacity)
      ? Math.max(0, Math.min(1, sampledOpacity))
      : 1;
    const showBasemapLabels = options.showBasemapLabels?.() ?? false;
    // Keep the completed target matte and contour while freeing one renderer
    // slot for the flat photograph. Release only after its actual publication.
    const revealing = !!pair.revealing && !pair.sourceOnly;
    const visualChanged =
      projectionChanged ||
      pair.lastMix !== mix ||
      pair.lastOpacity !== decorationOpacity ||
      pair.lastShowBasemapLabels !== showBasemapLabels ||
      pair.lastRevealing !== revealing;
    if (!visualChanged) return;
    const [sourceOverlay, targetOverlay] = pair.overlays;
    if (projectionChanged) {
      sourceOverlay.projective!.sceneToTexture = pair.sourceProjection!;
      sourceOverlay.projective!.sourceProjection = pair.sourceProjection!;
      targetOverlay.projective!.sceneToTexture = pair.targetProjection!;
      targetOverlay.projective!.sourceProjection = pair.targetProjection!;
    }
    sourceOverlay.projective!.frame!.opacity =
      0.9 * (pair.sourceOnly ? 1 : 1 - mix) * decorationOpacity;
    sourceOverlay.projective!.frame!.coverageOpacity = pair.sourceOnly
      ? 1
      : 1 - mix;
    targetOverlay.projective!.frame!.opacity = 0.9 * mix * decorationOpacity;
    targetOverlay.projective!.frame!.coverageOpacity = mix;
    sourceOverlay.backdropOpacity = decorationOpacity;
    targetOverlay.backdropOpacity = decorationOpacity;
    sourceOverlay.showBasemapLabels = showBasemapLabels;
    targetOverlay.showBasemapLabels = showBasemapLabels;
    scene.layer.setMapStyleScreenOverlay?.(
      ids[0],
      revealing ? targetOverlay : sourceOverlay
    );
    if (!pair.sourceOnly)
      scene.layer.setMapStyleScreenOverlay?.(
        ids[1],
        revealing ? null : targetOverlay
      );
    pair.lastMix = mix;
    pair.lastOpacity = decorationOpacity;
    pair.lastShowBasemapLabels = showBasemapLabels;
    pair.lastRevealing = revealing;
  }
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
    const mattePair = decorationPair;
    decorationPair = null;
    if (!pair && !mattePair) return;
    clearTimeout(pair?.finishedTimer);
    pair?.cancelWait?.();
    for (const unsubscribe of pair?.subscriptions ?? []) unsubscribe();
    for (const lease of pair?.leases ?? []) lease.release();
    for (const name of ids) scene.layer.setMapStyleScreenOverlay?.(name, null);
    scene.layer.setMapStylePhotoMosaic?.(`${id}-group`, null);
    for (const item of pair?.auxiliary ?? []) item.composer.dispose();
    for (const item of pair?.photos ?? []) {
      item.composer.attach(null);
      if (
        ![...pixels.values()].some(
          (cached) => cached.composer === item.composer
        )
      )
        disposePixels(item);
    }
    matteTexture?.dispose();
    matteTexture = null;
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
        auxiliary = [],
        auxiliaryExpected = auxiliary.length,
        sourceView,
        requireSource = false,
        retainUntilReveal = false,
        decoration,
        decorationOnly = false,
        decorationOpacity,
      } = {}
    ) {
      if (decorationOnly) {
        cancel();
        if (
          disposed ||
          !removeFrame ||
          !scene.layer.setMapStyleScreenOverlay ||
          !decoration
        )
          return;
        const mesh = getSharedThreeSceneRuntimes(map).some((runtime) => {
          if (
            !runtime.mountsOnLocalFrame ||
            !(runtime.providesTerrain || runtime.receivesScreenImages)
          )
            return false;
          return true;
        });
        if (
          !mesh ||
          !scene.layer.getLocalFrame() ||
          !scene.layer.projectSceneToLngLat([0, 0, 0])
        )
          return;
        matteTexture = new DataTexture(
          new Uint8Array([0, 0, 0, 0]),
          1,
          1,
          RGBAFormat,
          UnsignedByteType
        );
        matteTexture.needsUpdate = true;
        const startBearing = degToRad(map.getBearing() as Degrees);
        const isSourceOnly = sourceOnly || from.record.id === to.record.id;
        const matteDecoration: DrapeDecoration = {
          backdropLook: decoration.backdropLook
            ? { ...decoration.backdropLook }
            : undefined,
          backdropTint: decoration.backdropTint
            ? [...decoration.backdropTint]
            : undefined,
        };
        const pair: DecorationPair = {
          from,
          to,
          sourceProjection: new Matrix4(),
          targetProjection: new Matrix4(),
          startBearing,
          bearingDelta: headingDelta(
            startBearing,
            degToRad(to.pose.bearingDeg as Degrees)
          ),
          finished: false,
          decoration: matteDecoration,
          decorationOpacity,
          sourceOnly: isSourceOnly,
          overlays: [
            {
              texture: matteTexture,
              textureRevision: 0,
              viewportToTexture: identity,
              projective: {
                sceneToTexture: new Matrix4(),
                sourceProjection: new Matrix4(),
                underlay: true,
                fillGaps: false,
                frame: {
                  opacity: 0,
                  width: 2,
                  feather: 50,
                  featherOpacity: 0.8 / 0.9,
                },
              },
              opacity: 0,
              backdropLook: matteDecoration.backdropLook,
              backdropTint: matteDecoration.backdropTint,
              backdropOpacity: 1,
              priority: 100,
              showBasemapLabels: options.showBasemapLabels?.() ?? false,
            },
            {
              texture: matteTexture,
              textureRevision: 0,
              viewportToTexture: identity,
              projective: {
                sceneToTexture: new Matrix4(),
                sourceProjection: new Matrix4(),
                underlay: true,
                fillGaps: false,
                frame: {
                  opacity: 0,
                  width: 2,
                  feather: 50,
                  featherOpacity: 0.8 / 0.9,
                },
              },
              opacity: 0,
              backdropLook: matteDecoration.backdropLook,
              backdropTint: matteDecoration.backdropTint,
              backdropOpacity: 1,
              priority: 101,
              showBasemapLabels: options.showBasemapLabels?.() ?? false,
            },
          ],
        };
        decorationPair = pair;
        apply();
        map.triggerRepaint();
        return {
          targetImageId: to.record.id,
          update(progress) {
            if (decorationPair !== pair) return;
            if (
              Math.abs(pair.bearingDelta) <= HEADING_EPSILON &&
              Number.isFinite(progress)
            )
              pair.fallbackProgress = Math.max(0, Math.min(1, progress));
            map.triggerRepaint();
          },
          reveal() {
            if (decorationPair !== pair) return;
            pair.revealing = true;
            apply();
            map.triggerRepaint();
          },
          finish() {
            if (decorationPair !== pair) return;
            pair.finished = true;
            apply();
            map.triggerRepaint();
          },
          dispose() {
            if (decorationPair === pair) cancel();
          },
        };
      }
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
      pair.auxiliaryExpected = sourceOnly ? 0 : auxiliaryExpected;
      pair.auxiliaryWaiting = [];
      for (const photo of sourceOnly ? [] : auxiliary.slice(0, 2)) {
        if (
          photo.record.id === from.record.id ||
          photo.record.id === to.record.id
        )
          continue;
        const native = {
          width: photo.calibration.widthPx as DevicePixels,
          height: photo.calibration.heightPx as DevicePixels,
        };
        const density = Math.min(
          1,
          512 / Math.max(native.width, native.height)
        ) as Ratio;
        const view: ImageView = {
          visible: { x: 0 as DevicePixels, y: 0 as DevicePixels, ...native },
          density,
        };
        const waiting: {
          photo: Photo;
          stack?: ImageLevelStack;
          view: ImageView;
        } = { photo, view };
        pair.auxiliaryWaiting.push(waiting);
        const demand = nativePixelPool.acquireDemand(sourceOf(photo), {
          priority: "high",
          coarseOnly: true,
        });
        pair.subscriptions.push(demand.release);
        demand.setView(view, 512 * 512);
        void demand.ready
          .then((stack) => {
            if (active !== pair) return;
            waiting.stack = stack;
            pair.subscriptions.push(
              stack.onContentChange(() => {
                if (active === pair) map.triggerRepaint();
              })
            );
            map.triggerRepaint();
          })
          .catch(() => {
            // An unavailable group member leaves repair disabled; never fill from
            // an incomplete set or silently request a whole high-resolution photo.
          });
      }
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
        prepareViews(frames) {
          if (active !== pair || pair.sourceOnly || frames.length < 3) return;
          const frame = scene.layer.getLocalFrame();
          const origin = scene.layer.projectSceneToLngLat([0, 0, 0]);
          if (!frame || !origin) return;
          const sceneToMetric = sceneToPhotoEnu(
            origin,
            frame.sceneFromLocal,
            from.pose,
            0
          );
          const metricToScene = sceneToMetric.clone().invert();
          const views = [0.25, 0.5, 0.75].map((fraction) =>
            previewSceneToClip(
              origin,
              frames[Math.round((frames.length - 1) * fraction)]
            ).multiply(metricToScene)
          );
          if (!views.every((view) => view.elements.every(Number.isFinite)))
            return;
          pair.gapRepair = {
            id: `${id}:${++gapGeneration}`,
            sceneToMetric,
            views,
            auxiliaryExpected: pair.auxiliaryExpected ?? 0,
            auxiliary: pair.auxiliaryEntries ?? [],
          };
          apply();
          map.triggerRepaint();
        },
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
