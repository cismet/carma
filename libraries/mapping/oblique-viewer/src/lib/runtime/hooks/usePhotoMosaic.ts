import { useEffect, useRef, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  Color,
  LinearFilter,
  Matrix4,
  Raycaster,
  SRGBColorSpace,
  Texture,
  Vector3,
} from "three";
import {
  acquireSharedThreeScene,
  acquireForegroundNetwork,
  getSharedThreeSceneRuntimes,
  subscribeSharedThreeTerrain,
  type SharedThreeSceneFrame,
  type MapStylePhotoMosaicEntry,
} from "@carma-mapping/engines/maplibre";
import {
  drawImageLevels,
  type ImageRect,
  type ImageLevelStack,
  type ImageLevelStackLease,
} from "@carma-commons/image-pyramid";
import type { CssPixels, DevicePixels, Ratio } from "@carma-units";
import type { ObliqueImageRecord } from "../../core/types";
import {
  imageProjectionMatrix,
  sceneToPhotoEnu,
} from "../../core/utils/image-projection";
import type { ScenePreviewPhoto } from "./useScenePreviewImage";
import {
  nativePixelPool,
  nativePreviewSource,
} from "../utils/native-preview-pool";
import {
  originalOf,
  pyramidOf,
  pyramidOptionsOf,
  type ObliqueViewportPhoto,
} from "../utils/oblique-viewport-source";
import { planPhotoMosaic } from "../../core/utils/photo-mosaic-plan";
import { viewportFoveatedTarget } from "../../core/utils/viewport-foveation";
import { createHoverCandidatePrefetch } from "../utils/hover-candidate-prefetch";
import { sampleVisibleSurface } from "../utils/sample-visible-surface";
import {
  readMosaicRegionQuality,
  type MosaicRegionQuality,
} from "../utils/mosaic-region-quality";

type Photo = ScenePreviewPhoto & ObliqueViewportPhoto;
type Hit = { point: Vector3; surface: "mesh" | "terrain" };
type Options = {
  map: MaplibreMap | null;
  enabled: boolean;
  groupKey: string;
  readRecords: () => readonly ObliqueImageRecord[];
  centerY: number;
  debug?: boolean;
  resolvePhoto: (record: ObliqueImageRecord) => Promise<Photo>;
  intersectSurface: (ray: Raycaster, eye: [number, number]) => Hit | null;
};
type Snapshot = {
  key: string;
  photo: Photo;
  crop: ImageRect;
  texture: Texture;
  canvas: OffscreenCanvas;
  priority: number;
  density: number;
  base?: boolean;
  quality?: MosaicRegionQuality;
  qualityFloor?: number;
  complete?: boolean;
};
const SNAPSHOT_BYTES = 128 * 1024 * 1024;
const BASE_BYTES = 16 * 1024 * 1024;
const DETAIL_BYTES = SNAPSHOT_BYTES - BASE_BYTES;
const DECODE_BYTES = 32 * 1024 * 1024;
const TILE_PIXELS = 1024;
let nextId = 0;

/** Visible-surface sampling and serial tile preparation share the normal native image pool. */
export const usePhotoMosaic = (options: Options) => {
  const current = useRef(options);
  current.current = options;
  useEffect(() => {
    if (options.enabled) options.map?.triggerRepaint();
  }, [
    options.enabled,
    options.map,
    options.centerY,
    options.groupKey,
    options.debug,
    options.readRecords,
  ]);
  const [status, setStatus] = useState({ message: "", loading: false });
  useEffect(() => {
    const { map } = current.current;
    if (!options.enabled || !map) {
      setStatus({ message: "", loading: false });
      return;
    }
    const scene = acquireSharedThreeScene(map);
    const id = `oblique-photo-mosaic-${++nextId}`;
    const snapshots = new Map<string, Snapshot>();
    const coarse = createHoverCandidatePrefetch();
    const retention = nativePixelPool.retainWorkingSet({
      maxImages: 8,
      maxParkedBytes: 64 * 1024 * 1024,
    });
    let groupKey = current.current.groupKey;
    const photos = new Map<string, Promise<Photo>>();
    const failedPhotos = new Set<string>();
    let disposed = false,
      generation = 0,
      frameKey = "",
      recordsKey = "",
      surfaceDirty = true;
    let clip: Matrix4 | undefined;
    let pixels = { width: 0, height: 0 };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let baseTimer: ReturnType<typeof setTimeout> | undefined;
    let baseController = new AbortController();
    let basePixelBudget = BASE_BYTES / 8;
    let active: ImageLevelStackLease | undefined;
    let releaseGeometryPriority: (() => void) | undefined;
    let abortWait: (() => void) | undefined;
    let work: Promise<void> | undefined;
    let lastDebug = current.current.debug;
    let contentTimer: ReturnType<typeof setTimeout> | undefined;
    const dirtyPhotos = new Set<string>();
    let refreshingContent = false;
    const contentSubscriptions = new Map<
      string,
      { stack: ImageLevelStack; unsubscribe: () => void }
    >();
    let activeProgress: (() => void) | undefined;
    const report = (message: string, loading = false) => {
      if (!disposed)
        setStatus((previous) =>
          previous.message === message && previous.loading === loading
            ? previous
            : { message, loading }
        );
    };
    const bytes = () =>
      [...snapshots.values()].reduce(
        (sum, item) => sum + item.canvas.width * item.canvas.height * 8,
        0
      );
    const detailBytes = () =>
      [...snapshots.values()].reduce(
        (sum, item) =>
          sum + (item.base ? 0 : item.canvas.width * item.canvas.height * 8),
        0
      );
    const drop = (item: Snapshot) => {
      item.texture.dispose();
      item.canvas.width = item.canvas.height = 1;
    };
    const projector = (photo: Photo) => {
      const local = scene.layer.getLocalFrame();
      const origin = scene.layer.projectSceneToLngLat([0, 0, 0]);
      if (!local || !origin) return undefined;
      return imageProjectionMatrix(
        photo.record,
        photo.calibration,
        photo.pose,
        sceneToPhotoEnu(
          origin,
          local.sceneFromLocal,
          photo.pose,
          photo.altitude
        )
      );
    };
    const queueContent = (photoId: string) => {
      if (disposed) return;
      dirtyPhotos.add(photoId);
      if (contentTimer !== undefined || refreshingContent) return;
      contentTimer = setTimeout(() => {
        contentTimer = undefined;
        if (disposed) return;
        refreshingContent = true;
        const ids = new Set(dirtyPhotos);
        dirtyPhotos.clear();
        activeProgress?.();
        const pending = [...snapshots.values()].filter((item) =>
          ids.has(item.photo.record.id)
        );
        let index = 0,
          changed = false;
        const paint = () => {
          const started = performance.now();
          while (!disposed && index < pending.length) {
            const item = pending[index++];
            if (snapshots.get(item.key) !== item) continue;
            const stack = nativePixelPool.peek(sourceFor(item.photo));
            const baseline =
              item.quality ??
              (item.base
                ? {
                    signature: "coarse-snapshot",
                    tiles: [
                      {
                        rect: item.crop,
                        density: item.qualityFloor ?? item.density,
                        token: 0,
                      },
                    ],
                  }
                : undefined);
            const quality =
              stack && readMosaicRegionQuality(stack, item.crop, baseline);
            if (quality) {
              const context = item.canvas.getContext("2d");
              if (context) {
                drawImageLevels(
                  context,
                  stack!,
                  {
                    originX: item.crop.x,
                    originY: item.crop.y,
                    scale: item.density,
                  },
                  item.canvas
                );
                item.quality = quality;
                item.texture.needsUpdate = true;
                changed = true;
              }
            }
            if (performance.now() - started >= 4 && index < pending.length) {
              contentTimer = setTimeout(() => {
                contentTimer = undefined;
                paint();
              }, 0);
              return;
            }
          }
          if (!disposed && changed) publish();
          refreshingContent = false;
          if (!disposed && dirtyPhotos.size)
            queueContent(dirtyPhotos.values().next().value!);
        };
        paint();
      }, 0);
    };
    const syncContentSubscriptions = () => {
      const available = new Map(
        [...snapshots.values()].map((item) => [
          item.photo.record.id,
          item.photo,
        ])
      );
      for (const [photoId, subscription] of contentSubscriptions) {
        const photo = available.get(photoId);
        if (
          !photo ||
          nativePixelPool.peek(sourceFor(photo)) !== subscription.stack
        ) {
          subscription.unsubscribe();
          contentSubscriptions.delete(photoId);
        }
      }
      for (const [photoId, photo] of available) {
        const stack = nativePixelPool.peek(sourceFor(photo));
        if (
          !stack ||
          contentSubscriptions.get(photoId)?.stack === stack ||
          !stack.onContentChange
        )
          continue;
        contentSubscriptions.set(photoId, {
          stack,
          unsubscribe: stack.onContentChange(() => queueContent(photoId)),
        });
        queueContent(photoId);
      }
    };
    const publish = () => {
      const projections = new Map<string, Matrix4 | undefined>();
      const projectOnce = (photo: Photo) => {
        if (!projections.has(photo.record.id))
          projections.set(photo.record.id, projector(photo));
        return projections.get(photo.record.id)?.clone();
      };
      const entries: MapStylePhotoMosaicEntry[] = [
        ...snapshots.values(),
      ].flatMap((item) => {
        const projection = projectOnce(item.photo);
        if (!projection) return [];
        const sourceProjection = projection.clone();
        const crop = item.crop,
          native = item.photo.calibration;
        projection.premultiply(
          new Matrix4().set(
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
        return [
          {
            texture: item.texture,
            sceneToTexture: projection,
            sourceProjection,
            opacity: 1,
            priority:
              item.priority * 2 +
              (item.base ? 0 : 1 + Math.min(1, item.density) * 0.5),
          },
        ];
      });
      if (current.current.debug) {
        const outlined = new Map<string, Snapshot>();
        for (const item of snapshots.values())
          outlined.set(item.photo.record.id, item);
        const nearest = Math.max(
          0,
          ...[...outlined.values()].map((item) => item.priority)
        );
        for (const item of outlined.values()) {
          const projection = projectOnce(item.photo);
          if (projection)
            entries.push({
              texture: item.texture,
              sceneToTexture: projection,
              sourceProjection: projection,
              opacity: 1,
              priority: item.priority * 2 + 1.9,
              outline: {
                color: new Color(
                  item.priority === nearest ? "#ffe45e" : "#59e8ff"
                ),
                width: 1 as CssPixels,
              },
            });
        }
      }
      scene.layer.setMapStylePhotoMosaic(id, entries.length ? entries : null);
      syncContentSubscriptions();
      map.triggerRepaint();
    };
    const sourceFor = (photo: Photo) =>
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
    const installBase = (
      photo: Photo,
      priority: number,
      draw: (
        context: OffscreenCanvasRenderingContext2D,
        canvas: OffscreenCanvas,
        scale: number
      ) => void,
      qualityFloor?: number
    ) => {
      const width = photo.calibration.widthPx,
        height = photo.calibration.heightPx;
      const scale = Math.min(
        1,
        512 / Math.max(width, height),
        Math.sqrt(basePixelBudget / (width * height))
      );
      const canvas = new OffscreenCanvas(
        Math.max(1, Math.floor(width * scale)),
        Math.max(1, Math.floor(height * scale))
      );
      const context = canvas.getContext("2d");
      if (!context) {
        canvas.width = canvas.height = 1;
        return false;
      }
      try {
        draw(context, canvas, scale);
      } catch {
        canvas.width = canvas.height = 1;
        return false;
      }
      const texture = new Texture(canvas);
      texture.colorSpace = SRGBColorSpace;
      texture.flipY = true;
      texture.minFilter = texture.magFilter = LinearFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      const key = `${photo.record.id}:base`,
        previous = snapshots.get(key);
      snapshots.set(key, {
        key,
        photo,
        priority,
        base: true,
        density: scale,
        qualityFloor: qualityFloor ?? previous?.qualityFloor,
        quality: previous?.quality,
        canvas,
        texture,
        crop: { x: 0, y: 0, width, height } as ImageRect,
      });
      if (previous) drop(previous);
      return true;
    };
    const residentBase = (
      photo: Photo,
      priority: number,
      stack: ImageLevelStack
    ) => {
      const existing = snapshots.get(`${photo.record.id}:base`);
      if (existing) {
        existing.priority = priority;
        return true;
      }
      const floor = stack.pyramid?.levels.find(
        (level) => level.level === stack.plan?.floor
      );
      if (!floor) return false;
      for (let row = 0; row < floor.rows; row++)
        for (let col = 0; col < floor.cols; col++)
          if (!stack.isResident(floor.level, col, row)) return false;
      const installed = installBase(photo, priority, (context, canvas, scale) =>
        drawImageLevels(
          context,
          stack,
          { originX: 0, originY: 0, scale },
          canvas
        )
      );
      const base = snapshots.get(`${photo.record.id}:base`);
      if (installed && base)
        base.quality = readMosaicRegionQuality(stack, base.crop) ?? undefined;
      return installed;
    };
    const makeRoom = (incomingBytes: number, wanted: ReadonlySet<string>) => {
      // Keep the old geographic coverage while freeing a bounded replacement
      // slot. These explicitly coarse fallbacks never satisfy a desired LOD key.
      const stale = [...snapshots.values()]
        .filter(
          (item) =>
            !item.base &&
            !wanted.has(item.key) &&
            Math.max(item.canvas.width, item.canvas.height) > 256
        )
        .sort((a, b) => a.priority - b.priority);
      for (const item of stale) {
        if (detailBytes() + incomingBytes <= DETAIL_BYTES) break;
        const scale = 256 / Math.max(item.canvas.width, item.canvas.height);
        const canvas = new OffscreenCanvas(
          Math.max(1, Math.ceil(item.canvas.width * scale)),
          Math.max(1, Math.ceil(item.canvas.height * scale))
        );
        const context = canvas.getContext("2d");
        if (!context) {
          canvas.width = canvas.height = 1;
          continue;
        }
        try {
          context.drawImage(item.canvas, 0, 0, canvas.width, canvas.height);
        } catch {
          canvas.width = canvas.height = 1;
          continue;
        }
        const texture = new Texture(canvas);
        texture.colorSpace = SRGBColorSpace;
        texture.flipY = true;
        texture.minFilter = texture.magFilter = LinearFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        const key = `${item.key}:fallback`;
        snapshots.delete(item.key);
        snapshots.set(key, {
          ...item,
          key,
          canvas,
          texture,
          density: item.density * scale,
        });
        drop(item);
      }
      publish();
      return detailBytes() + incomingBytes <= DETAIL_BYTES;
    };
    const cancel = () => {
      generation++;
      clearTimeout(baseTimer);
      baseController.abort();
      baseController = new AbortController();
      coarse.update([], true);
      abortWait?.();
      abortWait = undefined;
      activeProgress = undefined;
      releaseGeometryPriority?.();
      releaseGeometryPriority = undefined;
      active?.release();
      active = undefined;
    };
    const waitReady = (lease: ImageLevelStackLease, epoch: number) =>
      new Promise<void>((resolve, reject) => {
        let done = false;
        let unsubscribe = () => {};
        const finish = (error?: Error) => {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          unsubscribe();
          if (abortWait === abort) abortWait = undefined;
          error ? reject(error) : resolve();
        };
        const abort = () => finish(new Error("Mosaic preparation superseded"));
        const timeout = setTimeout(
          () => finish(new Error("Mosaic region timeout")),
          15000
        );
        const check = () => {
          if (disposed || epoch !== generation) abort();
          else if (lease.stack.error)
            finish(new Error(String(lease.stack.error)));
          else if (lease.stack.metrics.visibleReady) finish();
        };
        abortWait = abort;
        unsubscribe = lease.stack.subscribe(check);
        if (done) unsubscribe();
        check();
      });
    const run = async () => {
      clearTimeout(baseTimer);
      baseController.abort();
      baseController = new AbortController();
      coarse.update([], true);
      const epoch = generation,
        camera = clip?.clone(),
        size = { ...pixels };
      if (!camera || !size.width || !size.height) return;
      const valid = () => !disposed && generation === epoch;
      const sampled = await sampleVisibleSurface({
        clip: camera,
        pixels: size,
        projectEye: (point) => scene.layer.projectSceneToLngLat(point),
        intersectSurface: (ray, eye) =>
          current.current.intersectSurface(ray, eye),
        isCurrent: valid,
      });
      if (!sampled || !valid()) return;
      const { samples, sampleScreen, centerSampleIndex, cols, rows } = sampled;
      const records = current.current.readRecords();
      const prepared: Photo[] = [];
      for (const record of records) {
        if (!valid()) return;
        let promise = photos.get(record.id);
        if (!promise) {
          promise = current.current.resolvePhoto(record);
          photos.set(record.id, promise);
        }
        try {
          prepared.push(await promise);
        } catch {
          /* An unavailable pose cannot be projected. */
        }
      }
      if (!valid()) return;
      const byId = new Map(prepared.map((photo) => [photo.record.id, photo]));
      const plan = planPhotoMosaic({
        photos: prepared
          .filter((photo) => !failedPhotos.has(photo.record.id))
          .flatMap((photo) => {
            const projection = projector(photo);
            return projection
              ? [
                  {
                    id: photo.record.id,
                    projection,
                    width: photo.calibration.widthPx,
                    height: photo.calibration.heightPx,
                  },
                ]
              : [];
          }),
        samples,
        centerSampleIndex,
        centerY: current.current.centerY,
        sampleRadiusPixels: sampled.sampleRadiusPixels,
      });
      retention.update({
        maxImages: plan.length,
        maxParkedBytes: Math.min(
          256 * 1024 * 1024,
          Math.max(64 * 1024 * 1024, size.width * size.height * 32)
        ),
      });
      const previousBases = [...snapshots.values()].filter((item) => item.base);
      basePixelBudget = Math.floor(
        BASE_BYTES / 8 / Math.max(1, plan.length + previousBases.length)
      );
      for (const item of previousBases)
        if (item.canvas.width * item.canvas.height > basePixelBudget)
          installBase(item.photo, item.priority, (context, canvas) =>
            context.drawImage(item.canvas, 0, 0, canvas.width, canvas.height)
          );
      const wanted = new Set<string>();
      const jobs: {
        key: string;
        photo: Photo;
        crop: ImageRect;
        density: number;
        priority: number;
        distance: number;
        pixelError: number;
        focusDistance: number;
      }[] = [];
      let nativeLimited = false;
      for (const entry of plan) {
        const photo = byId.get(entry.id)!;
        for (const [patchIndex, roi] of entry.patches.entries()) {
          const screen = sampleScreen[entry.coverage[patchIndex]];
          // Preserve one-pixel detail around the screen centre; the nearest
          // possible point of the sampled cell sets its peripheral error.
          const foveated = viewportFoveatedTarget({
            density: roi.requiredDensity ?? roi.density,
            point: screen,
            viewport: size,
            cellRadiusPixels: sampled.sampleRadiusPixels,
          });
          nativeLimited ||=
            (roi.requiredDensity ?? roi.density) / foveated.pixelError > 1;
          const density = Math.min(
            1,
            2 ** Math.ceil(Math.log2(foveated.density))
          );
          if (!(density > 0)) continue;
          const step = TILE_PIXELS / density;
          const distance = screen
            ? Math.hypot(screen.x - size.width / 2, screen.y - size.height / 2)
            : Infinity;
          for (
            let y = Math.floor(roi.y / step) * step;
            y < roi.y + roi.height;
            y += step
          ) {
            for (
              let x = Math.floor(roi.x / step) * step;
              x < roi.x + roi.width;
              x += step
            ) {
              // Fetch only the owned cell's intersection with this tile, plus
              // one output texel for filtering, rather than its full grid box.
              const left = Math.max(
                0,
                Math.floor(Math.max(x, roi.x) * density - 1) / density
              );
              const top = Math.max(
                0,
                Math.floor(Math.max(y, roi.y) * density - 1) / density
              );
              const right = Math.min(
                photo.calibration.widthPx,
                Math.ceil(Math.min(x + step, roi.x + roi.width) * density + 1) /
                  density
              );
              const bottom = Math.min(
                photo.calibration.heightPx,
                Math.ceil(
                  Math.min(y + step, roi.y + roi.height) * density + 1
                ) / density
              );
              const crop = {
                x: left,
                y: top,
                width: right - left,
                height: bottom - top,
              } as ImageRect;
              const key = `${entry.id}:${density}:${left}:${top}:${right}:${bottom}`;
              if (wanted.has(key)) continue;
              wanted.add(key);
              const cached = snapshots.get(key);
              if (cached) cached.priority = entry.priority;
              if (!cached || cached.complete === false)
                jobs.push({
                  key,
                  photo,
                  crop,
                  density,
                  priority: entry.priority,
                  distance,
                  pixelError: foveated.pixelError,
                  focusDistance: foveated.focusDistance,
                });
            }
          }
        }
      }
      // Fetch central pixels first across all contributing photos. Layering
      // remains independently ordered by the photo-centre rank.
      jobs.sort(
        (a, b) =>
          a.pixelError - b.pixelError ||
          a.distance - b.distance ||
          b.priority - a.priority
      );
      // Drop out-of-neighbourhood photos, but retain old regions of still-visible photos until replacements are complete.
      const relevant = new Set(records.map((record) => record.id));
      const planned = new Map(plan.map((entry) => [entry.id, entry]));
      for (const [key, item] of snapshots) {
        const entry = planned.get(item.photo.record.id);
        item.priority = entry?.priority ?? 0;
        const area = entry?.view.visible;
        const outside =
          area &&
          (item.crop.x >= area.x + area.width ||
            item.crop.y >= area.y + area.height ||
            item.crop.x + item.crop.width <= area.x ||
            item.crop.y + item.crop.height <= area.y);
        if (!relevant.has(item.photo.record.id) || outside) {
          snapshots.delete(key);
          drop(item);
        }
      }
      publish();
      let limited = nativeLimited,
        failed = false;
      if (jobs.some((job) => !failedPhotos.has(job.photo.record.id)))
        report(
          `Flächig: ${plan.length} Fotos · ${samples.length}/${
            cols * rows
          } Oberflächenpunkte · lädt`,
          true
        );
      for (const job of jobs) {
        if (!valid()) return;
        if (failedPhotos.has(job.photo.record.id)) continue;
        const width = Math.ceil(job.crop.width * job.density),
          height = Math.ceil(job.crop.height * job.density);
        const incomingBytes = snapshots.has(job.key) ? 0 : width * height * 8;
        if (
          detailBytes() + incomingBytes > DETAIL_BYTES &&
          !makeRoom(incomingBytes, wanted)
        ) {
          limited = true;
          continue;
        }
        const source = sourceFor(job.photo);
        const releaseNetwork = acquireForegroundNetwork(
          map,
          "oblique-mosaic-pixels",
          { refinementOnly: true }
        );
        releaseGeometryPriority = releaseNetwork;
        let lease: ImageLevelStackLease;
        try {
          lease = nativePixelPool.acquire(source);
        } catch {
          releaseNetwork();
          releaseGeometryPriority = undefined;
          failed = true;
          failedPhotos.add(job.photo.record.id);
          continue;
        }
        active = lease;
        lease.stack.configure({
          decodedBudget: () => DECODE_BYTES,
          idlePrefetch: "none",
        });
        let canvas: OffscreenCanvas | undefined;
        let unsubscribeProgress = () => {};
        try {
          await new Promise<void>((resolve, reject) => {
            let finished = false;
            const finish = (error?: unknown) => {
              if (finished) return;
              finished = true;
              clearTimeout(timeout);
              if (abortWait === abort) abortWait = undefined;
              error ? reject(error) : resolve();
            };
            const abort = () => finish(new Error("Mosaic metadata superseded"));
            const timeout = setTimeout(
              () => finish(new Error("Mosaic metadata timeout")),
              15000
            );
            abortWait = abort;
            lease.stack.ready.then(() => finish(), finish);
            if (!valid()) abort();
          });
          if (!valid()) return;
          lease.stack.setView(
            { visible: job.crop, density: job.density as Ratio },
            width * height
          );
          const progress = () => {
            if (
              !valid() ||
              !current.current
                .readRecords()
                .some((record) => record.id === job.photo.record.id)
            )
              return;
            const previous = snapshots.get(job.key);
            const quality = readMosaicRegionQuality(
              lease.stack,
              job.crop,
              previous?.quality
            );
            if (!quality) return;
            const target =
              previous?.canvas ?? new OffscreenCanvas(width, height);
            const context = target.getContext("2d");
            if (!context) {
              if (!previous) target.width = target.height = 1;
              return;
            }
            drawImageLevels(
              context,
              lease.stack,
              { originX: job.crop.x, originY: job.crop.y, scale: job.density },
              target
            );
            const texture = previous?.texture ?? new Texture(target);
            texture.colorSpace = SRGBColorSpace;
            texture.flipY = true;
            texture.minFilter = texture.magFilter = LinearFilter;
            texture.generateMipmaps = false;
            texture.needsUpdate = true;
            snapshots.set(job.key, {
              ...job,
              canvas: target,
              texture,
              quality,
              complete: false,
            });
            publish();
          };
          activeProgress = progress;
          unsubscribeProgress =
            lease.stack.onContentChange?.(() =>
              queueContent(job.photo.record.id)
            ) ?? (() => {});
          progress();
          await waitReady(lease, epoch);
          progress();
          if (
            !valid() ||
            !current.current
              .readRecords()
              .some((record) => record.id === job.photo.record.id)
          )
            return;
          residentBase(job.photo, job.priority, lease.stack);
          const progressing = snapshots.get(job.key);
          if (progressing) {
            progressing.complete = true;
            publish();
            continue;
          }
          canvas = new OffscreenCanvas(width, height);
          const context = canvas.getContext("2d");
          if (!context) throw Error("Mosaic canvas unavailable");
          drawImageLevels(
            context,
            lease.stack,
            { originX: job.crop.x, originY: job.crop.y, scale: job.density },
            canvas
          );
          const texture = new Texture(canvas);
          texture.colorSpace = SRGBColorSpace;
          texture.flipY = true;
          texture.minFilter = texture.magFilter = LinearFilter;
          texture.generateMipmaps = false;
          texture.needsUpdate = true;
          snapshots.set(job.key, {
            ...job,
            canvas,
            texture,
            complete: true,
            quality:
              readMosaicRegionQuality(lease.stack, job.crop) ?? undefined,
          });
          canvas = undefined;
          publish();
        } catch {
          if (valid()) {
            failed = true;
            failedPhotos.add(job.photo.record.id);
            // A failed top photo cannot permanently reserve coverage. Replan
            // behind this serial batch with the next covering photo instead.
            schedule();
          }
        } finally {
          releaseNetwork();
          if (releaseGeometryPriority === releaseNetwork)
            releaseGeometryPriority = undefined;
          unsubscribeProgress();
          activeProgress = undefined;
          if (canvas) canvas.width = canvas.height = 1;
          lease.stack.configure({
            decodedBudget: undefined,
            idlePrefetch: "next-level",
          });
          lease.release();
          if (active === lease) active = undefined;
        }
      }
      if (!valid()) return;
      if (
        !failed &&
        wanted.size > 0 &&
        [...wanted].every(
          (key) => snapshots.has(key) && snapshots.get(key)?.complete !== false
        )
      )
        for (const [key, item] of snapshots)
          if (!item.base && !wanted.has(key)) {
            snapshots.delete(key);
            drop(item);
          }
      publish();
      const coverage = new Set(plan.flatMap((entry) => [...entry.coverage]))
        .size;
      const reportSnapshots = () => {
        const count = new Set(
          [...snapshots.values()].map((item) => item.photo.record.id)
        ).size;
        report(
          `Flächig: ${count}/${Math.max(count, plan.length)} Fotos · Buffer ${
            size.width
          }×${size.height} · Snapshots ${Math.ceil(
            bytes() / 1048576
          )} MiB · Rasterabdeckung ${coverage}/${cols * rows}${
            limited
              ? " · Quellauflösung oder Snapshotbudget begrenzt"
              : failed
              ? " · einzelne Bildregionen nicht verfügbar"
              : ""
          }`
        );
      };
      reportSnapshots();
      // Narrow footprints can fall between raster cells. They still receive the
      // existing bounded compressed L6 warmup; no unproven full-resolution ROI.
      const contributors = plan.map((entry) => ({
        photo: byId.get(entry.id)!,
        priority: entry.priority,
      }));
      const contributorIds = new Set(
        contributors.map((entry) => entry.photo.record.id)
      );
      coarse.update(
        [
          ...contributors.map((entry) => sourceFor(entry.photo)),
          ...prepared
            .filter((photo) => !contributorIds.has(photo.record.id))
            .map(sourceFor),
        ],
        false
      );
      const baseSignal = baseController.signal;
      const until = performance.now() + 15000;
      const fillBases = async () => {
        let pending = false,
          changed = false;
        for (const { photo, priority } of contributors) {
          if (!valid() || baseSignal.aborted) return;
          if (snapshots.has(`${photo.record.id}:base`)) continue;
          const source = sourceFor(photo),
            cached = nativePixelPool.peek(source);
          if (cached && residentBase(photo, priority, cached)) {
            changed = true;
            continue;
          }
          let canvas: OffscreenCanvas | undefined;
          try {
            canvas = await coarse.readBase(source, baseSignal);
            if (!valid() || baseSignal.aborted) return;
            if (canvas) {
              const pixels = canvas;
              changed =
                installBase(
                  photo,
                  priority,
                  (context, target) =>
                    context.drawImage(
                      pixels,
                      0,
                      0,
                      target.width,
                      target.height
                    ),
                  Math.min(
                    pixels.width / photo.calibration.widthPx,
                    pixels.height / photo.calibration.heightPx
                  )
                ) || changed;
            } else pending = true;
          } catch {
            pending = true;
          } finally {
            if (canvas) canvas.width = canvas.height = 1;
          }
        }
        if (changed) {
          publish();
          reportSnapshots();
        }
        if (
          pending &&
          valid() &&
          !baseSignal.aborted &&
          performance.now() < until
        )
          baseTimer = setTimeout(() => {
            void fillBases();
          }, 500);
      };
      void fillBases();
      for (const key of photos.keys())
        if (!relevant.has(key)) photos.delete(key);
    };
    const schedule = () => {
      if (disposed || timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (work) {
          schedule();
          return;
        }
        work = run()
          .catch(() => report("Flächig: Projektion derzeit nicht verfügbar"))
          .finally(() => {
            work = undefined;
          });
      }, 250);
    };
    const removeFrame = scene.layer.addBeforeRenderCallback?.(
      (frame: SharedThreeSceneFrame) => {
        if (lastDebug !== current.current.debug) {
          lastDebug = current.current.debug;
          publish();
        }
        const groupChanged = groupKey !== current.current.groupKey;
        if (groupChanged) {
          groupKey = current.current.groupKey;
          cancel();
          photos.clear();
          failedPhotos.clear();
          for (const item of snapshots.values()) drop(item);
          snapshots.clear();
          surfaceDirty = true;
        }
        const next = new Matrix4().multiplyMatrices(
          frame.renderCamera.projectionMatrix,
          frame.renderCamera.matrixWorldInverse
        );
        const actual = scene.layer.getMapStyleProjectionState?.().photoMosaic;
        const buffer =
          actual &&
          actual.width > 0 &&
          actual.requestedWidth === Math.floor(frame.viewport.x) &&
          actual.requestedHeight === Math.floor(frame.viewport.y)
            ? { width: actual.width, height: actual.height }
            : { width: frame.viewport.x, height: frame.viewport.y };
        const nextFrame = [...next.elements, buffer.width, buffer.height].join(
          ","
        );
        const records = current.current.readRecords();
        const nextRecords =
          records.map((record) => record.id).join(",") +
          `:${current.current.centerY}`;
        if (
          nextFrame !== frameKey ||
          nextRecords !== recordsKey ||
          surfaceDirty
        ) {
          if (recordsKey !== nextRecords) {
            const visibleIds = new Set(records.map((record) => record.id));
            for (const [key, item] of snapshots)
              if (!visibleIds.has(item.photo.record.id)) {
                snapshots.delete(key);
                drop(item);
              }
          }
          const cameraChanged = frameKey !== nextFrame;
          frameKey = nextFrame;
          recordsKey = nextRecords;
          surfaceDirty = false;
          clip = next;
          pixels = buffer;
          // New LOD/nearby-query results coalesce behind the in-flight tile. Only
          // a different camera invalidates its sampled screen-space demand.
          if (cameraChanged) {
            failedPhotos.clear();
            cancel();
          }
          publish();
          schedule();
        }
      }
    );
    const unsubscribePool = nativePixelPool.subscribe?.(
      syncContentSubscriptions
    );
    let surfaceRevision = "";
    const refreshSurfaces = () => {
      const key = getSharedThreeSceneRuntimes(map)
        .map(
          (runtime) =>
            `${runtime.id}:${runtime.root.visible}:${
              runtime.mapStyleProjectionVersion?.() ?? 0
            }:${runtime.hasRenderableContent?.() ?? false}`
        )
        .join("|");
      if (key !== surfaceRevision) {
        surfaceRevision = key;
        surfaceDirty = true;
        map.triggerRepaint();
      }
    };
    map.on("idle", refreshSurfaces);
    const unsubscribeTerrain = subscribeSharedThreeTerrain(map, () => {
      surfaceDirty = true;
      map.triggerRepaint();
    });
    map.triggerRepaint();
    return () => {
      disposed = true;
      cancel();
      coarse.dispose();
      retention.release();
      clearTimeout(timer);
      clearTimeout(contentTimer);
      unsubscribePool?.();
      for (const subscription of contentSubscriptions.values())
        subscription.unsubscribe();
      contentSubscriptions.clear();
      dirtyPhotos.clear();
      removeFrame?.();
      unsubscribeTerrain();
      map.off("idle", refreshSurfaces);
      scene.layer.setMapStylePhotoMosaic(id, null);
      for (const item of snapshots.values()) drop(item);
      snapshots.clear();
      scene.release();
    };
  }, [options.enabled, options.map]);
  return status;
};
