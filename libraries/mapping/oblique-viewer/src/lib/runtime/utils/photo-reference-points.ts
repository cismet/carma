import type { Degrees, DevicePixels, Meters } from "@carma-units";
import type { Map as MaplibreMap } from "maplibre-gl";
import { Ray, Raycaster, type Vector3 } from "three";
import { acquireSharedThreeScene } from "@carma-mapping/engines/maplibre";
import type { ObliqueGroundTarget, ObliqueImageRecord } from "../../core/types";
import {
  imageProjectionMatrix,
  sceneToPhotoEnu,
} from "../../core/utils/image-projection";
import {
  photoCenterRays,
  photoReferenceRays,
  photoCenterRayUv,
  presentationPointToScene,
  sceneToPresentationPoint,
} from "../../core/utils/photo-center-rays";
import {
  normalizeSeamlessCenterY,
  type SeamlessImagePoint,
} from "../../core/utils/seamless-image-center";
import { objectCoveragePixelRay } from "../../core/utils/object-coverage";
import type { ScenePreviewPhoto } from "../hooks/useScenePreviewImage";
import type { PhotoAxisSurfaceMode } from "./photo-axis-picker";
import { physicalImageQueryTarget } from "./image-selection-ecef";

export type PhotoReferenceRayKind =
  | "preferred"
  | "optical"
  | "sensor"
  | "sensor-up"
  | "catalog";

export type PhotoReferencePoint = Readonly<{
  target: ObliqueGroundTarget & {
    ecefMeters: [number, number, number];
    heightDatum: "dhhn2016";
    heightMeters: number;
  };
  surface: "mesh" | "terrain";
  /** Actual full-sensor bottom-up UV of the chosen calibrated ray. */
  imagePoint: SeamlessImagePoint;
}>;
type Options = {
  map: MaplibreMap;
  resolvePhoto: (record: ObliqueImageRecord) => Promise<ScenePreviewPhoto>;
  intersectSurface: (
    ray: Raycaster,
    eye: [number, number],
    mode: PhotoAxisSurfaceMode
  ) => { point: Vector3; surface: "mesh" | "terrain" } | null;
  readSurfaceRevision: () => string;
  isBusy?: () => boolean;
  /** Undefined keeps the image-centre parameter; null uses the physical optical axis. */
  readPreference?: (
    record: ObliqueImageRecord
  ) => { pitchDeg: Degrees; headingDeg?: Degrees } | null | undefined;
};
type Waiter = { finish: (point: PhotoReferencePoint | null) => void };
type Job = {
  key: string;
  revision?: string;
  record: ObliqueImageRecord;
  centerY: number;
  mode: PhotoAxisSurfaceMode;
  rayKind: PhotoReferenceRayKind;
  preference: { pitchDeg: Degrees; headingDeg?: Degrees } | null | undefined;
  photo?: ScenePreviewPhoto;
  waiters: Set<Waiter>;
};
// All five debug rays for 128 visible records fit without preferred-hit churn.
const CACHE_LIMIT = 1024;

/** Resident-surface reference points, prepared cooperatively outside rendering.
 * Cache values are geographic, so a scene-frame rebase does not invalidate a hit. */
export const createPhotoReferencePoints = (options: Options) => {
  const scene = acquireSharedThreeScene(options.map);
  const raycaster = new Raycaster();
  (raycaster as Raycaster & { firstHitOnly: boolean }).firstHitOnly = true;
  const cache = new Map<
    string,
    { point: PhotoReferencePoint | null; revision: string }
  >();
  const jobs = new Map<string, Job>();
  const identities = new WeakMap<ObliqueImageRecord, number>();
  let nextIdentity = 0;
  let active: Job | undefined;
  let cancelScheduled: (() => void) | undefined;
  let disposed = false;
  let scheduledToken: object | undefined;
  const finish = (
    job: Job,
    point: PhotoReferencePoint | null,
    retain = false
  ) => {
    if (jobs.get(job.key) !== job) return;
    jobs.delete(job.key);
    if (active === job) active = undefined;
    if (retain) {
      cache.delete(job.key);
      cache.set(job.key, { point, revision: job.revision! });
      while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    }
    for (const waiter of [...job.waiters]) waiter.finish(point);
    job.waiters.clear();
  };
  const keyFor = (
    record: ObliqueImageRecord,
    centerY: number,
    mode: PhotoAxisSurfaceMode,
    rayKind: PhotoReferenceRayKind
  ) => {
    let identity = identities.get(record);
    if (!identity) {
      identity = ++nextIdentity;
      identities.set(record, identity);
    }
    const parameter =
      rayKind === "preferred" ? normalizeSeamlessCenterY(centerY) : 0.5;
    const preference =
      rayKind === "preferred" ? options.readPreference?.(record) : undefined;
    const reference =
      preference === null
        ? "axis"
        : preference
        ? `${preference.headingDeg ?? "principal"}:${preference.pitchDeg}`
        : parameter;
    return {
      key: `${identity}|${rayKind}|${reference}|${mode}`,
      preference: preference ? { ...preference } : preference,
    };
  };
  const isCurrent = (job: Job) =>
    !disposed && jobs.get(job.key) === job && job.waiters.size > 0;
  const schedule = () => {
    if (disposed || active || cancelScheduled || !jobs.size) return;
    const token = {};
    scheduledToken = token;
    const run = () => {
      if (scheduledToken !== token) return;
      cancelScheduled = undefined;
      if (disposed) return;
      if (options.isBusy?.()) {
        const timer = setTimeout(() => {
          cancelScheduled = undefined;
          schedule();
        }, 50);
        cancelScheduled = () => clearTimeout(timer);
        return;
      }
      const job = jobs.values().next().value as Job | undefined;
      if (!job) return;
      active = job;
      void (async () => {
        try {
          if (job.rayKind === "catalog" && !job.record.catalogCenter) {
            finish(job, null);
            return;
          }
          job.photo ??= await options.resolvePhoto(job.record);
          if (!isCurrent(job)) return;
          if (options.isBusy?.()) return;
          const frame = scene.layer.getLocalFrame();
          const origin = scene.layer.projectSceneToLngLat([0, 0, 0]);
          // Missing scene initialization is not a cached no-hit verdict.
          if (!frame || !origin) {
            finish(job, null);
            return;
          }
          const sceneFromLocal = frame.sceneFromLocal.clone();
          const photo = job.photo;
          const sceneToPhoto = sceneToPhotoEnu(
            origin,
            sceneFromLocal,
            photo.pose,
            photo.altitude
          );
          const projection = imageProjectionMatrix(
            photo.record,
            photo.calibration,
            photo.pose,
            sceneToPhoto
          );
          const rays = job.preference
            ? photoReferenceRays(
                { projection, sceneToPhoto, calibration: photo.calibration },
                job.preference
              )
            : photoCenterRays({
                projection,
                sceneToPhoto,
                calibration: photo.calibration,
                centerY: job.preference === null ? 0.5 : job.centerY,
              });
          let ray = rays.preferred;
          if (job.rayKind === "optical") ray = rays.axis;
          else if (job.rayKind === "sensor") ray = rays.sensor;
          else if (job.rayKind === "sensor-up")
            ray = rays.sensor
              ? objectCoveragePixelRay(
                  projection,
                  rays.eye,
                  {
                    x: (photo.calibration.widthPx * 0.5) as DevicePixels,
                    y: (photo.calibration.heightPx * 0.5 - 1) as DevicePixels,
                  },
                  photo.calibration
                )
              : null;
          else if (job.rayKind === "catalog") {
            const catalog = job.record.catalogCenter;
            ray = null;
            if (
              rays.sensor &&
              catalog &&
              [catalog.longitude, catalog.latitude, catalog.heightMeters].every(
                Number.isFinite
              )
            ) {
              const direction = presentationPointToScene(
                catalog,
                origin,
                sceneFromLocal
              ).sub(rays.eye);
              if (
                direction.toArray().every(Number.isFinite) &&
                direction.lengthSq() > 0 &&
                Number.isFinite(direction.lengthSq())
              )
                ray = new Ray(rays.eye.clone(), direction.normalize());
            }
          }
          const imagePoint = photoCenterRayUv(projection, ray);
          if (!ray || !imagePoint) {
            finish(job, null);
            return;
          }
          raycaster.ray.copy(ray);
          // Preserve the old fresh-Raycaster defaults even if a surface callback
          // temporarily adjusts its range or layer mask during a previous job.
          raycaster.near = 0;
          raycaster.far = Infinity;
          raycaster.layers.set(0);
          (raycaster as Raycaster & { firstHitOnly: boolean }).firstHitOnly =
            true;
          job.revision = options.readSurfaceRevision();
          const hit = options.intersectSurface(
            raycaster,
            [photo.pose.longitude, photo.pose.latitude],
            job.mode
          );
          if (
            !hit ||
            !hit.point.toArray().every(Number.isFinite) ||
            hit.point.clone().sub(rays.eye).dot(ray.direction) <= 0
          ) {
            finish(job, null, true);
            return;
          }
          const ground = sceneToPresentationPoint(
            hit.point,
            origin,
            sceneFromLocal
          );
          if (
            ![ground.longitude, ground.latitude, ground.heightMeters].every(
              Number.isFinite
            )
          ) {
            finish(job, null, true);
            return;
          }
          const target = await physicalImageQueryTarget({
            ...ground,
            heightDatum: "dhhn2016",
          });
          if (!isCurrent(job)) return;
          if (
            !target.ecefMeters?.every(Number.isFinite) ||
            target.ecefMeters.length !== 3
          ) {
            finish(job, null);
            return;
          }
          finish(
            job,
            {
              target: {
                ...target,
                heightMeters: ground.heightMeters,
                heightDatum: "dhhn2016",
                ecefMeters: [...target.ecefMeters],
              },
              surface: hit.surface,
              imagePoint: { ...imagePoint },
            },
            true
          );
        } catch {
          // Transient calibration/geoid failures may be retried; no synthetic hit.
          finish(job, null);
        } finally {
          if (active === job) active = undefined;
          schedule();
        }
      })();
    };
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(run, { timeout: 100 });
      cancelScheduled = () => cancelIdleCallback(id);
    } else {
      const timer = setTimeout(run, 0);
      cancelScheduled = () => clearTimeout(timer);
    }
  };
  return {
    resolve(
      record: ObliqueImageRecord,
      centerY: number,
      mode: PhotoAxisSurfaceMode,
      signal?: AbortSignal,
      rayKind: PhotoReferenceRayKind = "preferred"
    ): Promise<PhotoReferencePoint | null> {
      if (disposed || signal?.aborted) return Promise.resolve(null);
      const { key, preference } = keyFor(record, centerY, mode, rayKind);
      const cached = cache.get(key);
      if (cached?.revision === options.readSurfaceRevision()) {
        cache.delete(key);
        cache.set(key, cached);
        return Promise.resolve(cached.point);
      }
      let job = jobs.get(key);
      if (!job) {
        while (jobs.size >= CACHE_LIMIT)
          finish(jobs.values().next().value!, null);
        job = {
          key,
          record,
          centerY:
            rayKind === "preferred" ? normalizeSeamlessCenterY(centerY) : 0.5,
          mode,
          rayKind,
          preference,
          waiters: new Set(),
        };
        jobs.set(key, job);
      }
      const queued = job;
      return new Promise((resolve) => {
        const waiter: Waiter = {
          finish: (point) => {
            signal?.removeEventListener("abort", abort);
            queued.waiters.delete(waiter);
            resolve(point);
          },
        };
        const abort = () => {
          waiter.finish(null);
          if (!queued.waiters.size) finish(queued, null);
          schedule();
        };
        queued.waiters.add(waiter);
        signal?.addEventListener("abort", abort, { once: true });
        schedule();
      });
    },
    /** undefined means not cached; null is a tested no-hit for this surface revision. */
    peek(
      record: ObliqueImageRecord,
      centerY: number,
      mode: PhotoAxisSurfaceMode,
      rayKind: PhotoReferenceRayKind = "preferred"
    ) {
      if (disposed) return undefined;
      const cached = cache.get(keyFor(record, centerY, mode, rayKind).key);
      return cached?.point === null &&
        cached.revision !== options.readSurfaceRevision()
        ? undefined
        : cached?.point;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scheduledToken = undefined;
      cancelScheduled?.();
      cancelScheduled = undefined;
      for (const job of [...jobs.values()]) finish(job, null);
      cache.clear();
      scene.release();
    },
  };
};

/** Physical straight-line distance; both inputs must explicitly supply EPSG:4978. */
export const photoReferenceDistanceMeters = (
  reference: PhotoReferencePoint | null,
  target: ObliqueGroundTarget
): Meters | null => {
  const a = reference?.target.ecefMeters;
  const b = target.ecefMeters;
  if (
    !a ||
    !b ||
    a.length !== 3 ||
    b.length !== 3 ||
    ![...a, ...b].every(Number.isFinite)
  )
    return null;
  const distance = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  return Number.isFinite(distance) ? (distance as Meters) : null;
};
