import { physicalImageQueryTarget } from "./image-selection-ecef";
import { physicalCenterDistance } from "../../core/utils/image-selection-index";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  InstancedMesh,
  Matrix3,
  Matrix4,
  Plane,
  Raycaster,
  Vector4,
  Vector3,
  type Box3,
  type Intersection,
  type Object3D,
} from "three";
import {
  acquireSharedThreeScene,
  getSharedThreeSceneRuntimes,
  getSharedThreeTerrainElevation,
  getSharedThreeTerrainElevations,
  subscribeSharedThreeTerrain,
} from "@carma-mapping/engines/maplibre";
import type { RasterDemTerrainRuntime } from "@carma-mapping/engines/maplibre/terrain";
import { degToRadNumeric, type CssPixels, type Meters } from "@carma-units";
import { shortestAngleDelta } from "@carma-commons/math";
import type {
  ObliqueImageRecord,
  ObliqueSelectionData,
} from "../../core/types";
import type { FootprintPointQuery } from "../../core/utils/viewport-footprints";
import { getOrComputeObliquePose } from "../../core/utils/oblique-pose";
import {
  imageProjectionMatrix,
  sceneToPhotoEnu,
} from "../../core/utils/image-projection";
import { getCameraCalibration } from "../../core/utils/calibration";
import {
  photoCenterRays,
  presentationPointToScene,
  screenPointOnPhotoPlane,
} from "../../core/utils/photo-center-rays";
import { projectObjectCoveragePoint } from "../../core/utils/object-coverage";
import { resolveCameraAltitude } from "./flyToImage";
import { groundDistanceM } from "./cameraMath";

export type PhotoAxisDebug = {
  imageId: string;
  seriesId: string;
  distance: Meters;
  surface: "mesh" | "terrain" | "catalog" | "catalog-reference";
} | null;
export type PhotoAxisSurfaceMode = "auto" | "mesh" | "terrain";
type AxisHit = {
  point: [number, number];
  surface: "mesh" | "terrain" | "catalog" | "catalog-reference";
  referencePoint?: Vector3;
  fallbackHeight?: number;
};

/** The worker filters the full catalog; only eligible photo axes touch live receivers.
 * Ground hits survive pointer/camera movement and are invalidated by receiver/LOD versions.
 */
export const createPhotoAxisPicker = (
  map: MaplibreMap,
  data: ObliqueSelectionData,
  heightOffset: number
) => {
  const hits = new Map<string, AxisHit | null>();
  const altitudes = new Map<string, Promise<number>>();
  const observers = new Set<(value: PhotoAxisDebug) => void>();
  let snapshot: PhotoAxisDebug = null;
  let revision = "";
  let nativeRevision = 0;
  let unsubscribeTerrain: (() => void) | undefined;
  const terrainChanged = () => {
    nativeRevision++;
    hits.clear();
  };
  let disposed = false;
  let screenClip: Matrix4 | undefined;
  let stopFrame: (() => void) | undefined;
  let frameLease: ReturnType<typeof acquireSharedThreeScene> | undefined;
  let receiverRoots: Object3D[] = [];
  let terrainBounds: readonly Box3[] = [];
  let terrainRuntimes: Partial<RasterDemTerrainRuntime>[] = [];
  let terrainBoundsFrame = "";
  let terrainRayCovered = false;
  const probeCoordinates = new Float64Array(128);
  const probeHeights = new Float64Array(64);
  const probePoint = new Vector3();
  const intervalAxes = ["x", "y", "z"] as const;
  const intersections: Intersection[] = [];
  const ray = new Raycaster();
  (ray as Raycaster & { firstHitOnly: boolean }).firstHitOnly = true;
  const emit = (value: PhotoAxisDebug) => {
    snapshot = value;
    for (const observer of observers) observer(value);
  };
  const sourceDataChanged = (event: {
    sourceId?: string;
    source?: { type?: string };
  }) => {
    if (event.source?.type === "raster-dem") {
      nativeRevision++;
      hits.clear();
    }
  };
  const isVisible = (root: Object3D) => {
    for (let object: Object3D | null = root; object; object = object.parent)
      if (!object.visible) return false;
    return true;
  };
  const refreshReceivers = () => {
    const runtimes = getSharedThreeSceneRuntimes(map);
    const receivers = runtimes.filter(
      (runtime) =>
        isVisible(runtime.root) &&
        (runtime.providesTerrain ||
          runtime.receivesMapStyleTexture ||
          runtime.receivesScreenImages)
    );
    const nextRevision =
      runtimes
        .map((runtime) =>
          [
            runtime.id,
            isVisible(runtime.root),
            runtime.mapStyleProjectionVersion?.() ?? 0,
          ].join(":")
        )
        .join("|") +
      ":" +
      nativeRevision;
    if (nextRevision !== revision) {
      revision = nextRevision;
      hits.clear();
      // CPU height bounds remain usable when terrain drawing is hidden by a mesh.
      // Hidden terrain roots never enter receiverRoots or any raycast/render list.
      terrainRuntimes = runtimes.filter(
        (runtime) =>
          runtime.providesTerrain &&
          typeof (runtime as Partial<RasterDemTerrainRuntime>)
            .getPublishedTerrainTiles === "function"
      );
      terrainBoundsFrame = "";
      // Keep tile roots so their raycast can cull whole bounding-volume branches.
      receiverRoots = receivers
        // Raster DEMs already register a height sampler. Avoid tracing their
        // dense grids; keep detailed mesh roots and their branch culling.
        .filter(
          ({ root }) =>
            root.getObjectByProperty?.("isMesh", true)?.userData
              .isShadowTerrainSurface !== true
        )
        .map((receiver) => receiver.root);
    }
  };
  const intersectCachedTerrain = (
    photoRay: Raycaster,
    cameraLngLat: [number, number],
    layer: ReturnType<typeof acquireSharedThreeScene>["layer"],
    maximumDistance: number
  ): Vector3 | null => {
    terrainRayCovered = false;
    const origin = layer.projectSceneToLngLat([0, 0, 0]);
    const frame = layer.getLocalFrame();
    const frameKey = [frame?.revision ?? 0, ...(origin ?? [])].join("|");
    if (frameKey !== terrainBoundsFrame) {
      terrainBoundsFrame = frameKey;
      terrainBounds = terrainRuntimes.flatMap(
        (runtime) =>
          runtime.getPublishedTerrainTiles?.().map((tile) => tile.bounds) ?? []
      );
    }
    if (!terrainBounds.length || photoRay.ray.direction.y >= -1e-6) return null;
    const base = layer.projectLngLatToScene(cameraLngLat, 0);
    const metre = layer.projectLngLatToScene(cameraLngLat, 1);
    if (!base || !metre) return null;
    const step = metre.distanceTo(base);
    if (!(step > 0) || !Number.isFinite(step)) return null;
    const intervals: { near: number; far: number }[] = [];
    for (const bounds of terrainBounds) {
      let near = Math.max(0, photoRay.near),
        far = Math.min(photoRay.far, maximumDistance);
      for (const axis of intervalAxes) {
        const origin = photoRay.ray.origin[axis],
          direction = photoRay.ray.direction[axis];
        const minimum = bounds.min[axis] - step,
          maximum = bounds.max[axis] + step;
        if (Math.abs(direction) < 1e-12) {
          if (origin < minimum || origin > maximum) {
            far = -1;
            break;
          }
        } else {
          const a = (minimum - origin) / direction,
            b = (maximum - origin) / direction;
          near = Math.max(near, Math.min(a, b));
          far = Math.min(far, Math.max(a, b));
          if (far < near) break;
        }
      }
      if (far >= near && Number.isFinite(far)) intervals.push({ near, far });
    }
    intervals.sort((a, b) => a.near - b.near);
    const merged: { near: number; far: number }[] = [];
    for (const interval of intervals) {
      const previous = merged.at(-1);
      if (previous && interval.near <= previous.far)
        previous.far = Math.max(previous.far, interval.far);
      else merged.push({ ...interval });
    }
    terrainRayCovered = merged.length > 0;
    let probes = 0;
    for (const interval of merged) {
      let distance = interval.near;
      let previous: { distance: number; residual: number } | null = null;
      while (distance <= interval.far && probes < 4096) {
        const count = Math.min(
          64,
          4096 - probes,
          Math.floor((interval.far - distance) / step) + 1
        );
        for (let index = 0; index < count; index++) {
          photoRay.ray.at(distance + index * step, probePoint);
          const location = layer.projectSceneToLngLat(probePoint);
          probeCoordinates[2 * index] = location?.[0] ?? NaN;
          probeCoordinates[2 * index + 1] = location?.[1] ?? NaN;
        }
        getSharedThreeTerrainElevations(
          map,
          probeCoordinates.subarray(0, 2 * count),
          probeHeights.subarray(0, count)
        );
        for (let index = 0; index < count; index++) {
          const at = distance + index * step,
            height = probeHeights[index];
          const ground = Number.isFinite(height)
            ? layer.projectLngLatToScene(
                [probeCoordinates[2 * index], probeCoordinates[2 * index + 1]],
                height
              )
            : null;
          if (!ground) {
            previous = null;
            continue;
          }
          photoRay.ray.at(at, probePoint);
          const residual = probePoint.y - ground.y;
          if (residual === 0) return probePoint.clone();
          if (previous && previous.residual >= 0 && residual <= 0) {
            const fraction = previous.residual / (previous.residual - residual);
            return photoRay.ray.at(
              previous.distance + fraction * (at - previous.distance),
              new Vector3()
            );
          }
          previous = { distance: at, residual };
        }
        probes += count;
        distance += count * step;
      }
    }
    return null;
  };
  const intersectSceneSurface = (
    photoRay: Raycaster,
    cameraLngLat: [number, number],
    layer: ReturnType<typeof acquireSharedThreeScene>["layer"],
    surfaceMode: PhotoAxisSurfaceMode = "auto"
  ): {
    point: Vector3;
    surface: "mesh" | "terrain";
    normal?: Vector3;
  } | null => {
    const visible = (hit: Intersection) => {
      let object: Object3D | null = hit.object;
      while (object) {
        if (!object.visible) return false;
        object = object.parent;
      }
      return true;
    };
    let surfaceHit: Intersection | undefined;
    if (surfaceMode !== "terrain") {
      intersections.length = 0;
      photoRay.intersectObjects(receiverRoots, true, intersections);
      const acceleratedRay = photoRay as Raycaster & { firstHitOnly?: boolean };
      if (
        acceleratedRay.firstHitOnly &&
        intersections.some((hit) => !visible(hit))
      ) {
        // Active LOD tiles can be hidden. Retry only that case to find the first visible hit.
        acceleratedRay.firstHitOnly = false;
        intersections.length = 0;
        try {
          photoRay.intersectObjects(receiverRoots, true, intersections);
        } finally {
          acceleratedRay.firstHitOnly = true;
        }
      }
      surfaceHit = intersections.find(visible);
    }
    const terrainHit =
      surfaceMode === "mesh"
        ? null
        : intersectCachedTerrain(
            photoRay,
            cameraLngLat,
            layer,
            surfaceHit?.distance ?? Infinity
          );
    if (
      terrainHit &&
      (!surfaceHit ||
        terrainHit.distanceTo(photoRay.ray.origin) < surfaceHit.distance - 0.1)
    )
      return { point: terrainHit, surface: "terrain" };
    if (surfaceHit) {
      let normal: Vector3 | undefined;
      if (surfaceHit.face) {
        const world = surfaceHit.object.matrixWorld.clone();
        if (
          surfaceHit.object instanceof InstancedMesh &&
          surfaceHit.instanceId !== undefined
        ) {
          const instance = new Matrix4();
          surfaceHit.object.getMatrixAt(surfaceHit.instanceId, instance);
          world.multiply(instance);
        }
        normal = surfaceHit.face.normal
          .clone()
          .applyMatrix3(new Matrix3().getNormalMatrix(world))
          .normalize();
      }
      return {
        point: surfaceHit.point,
        surface: "mesh",
        ...(normal ? { normal } : {}),
      };
    }
    if (surfaceMode === "mesh") return null;
    if (terrainRayCovered) return null;
    if (photoRay.ray.direction.y >= -1e-6) return null;
    let terrainHeight =
      getSharedThreeTerrainElevation(map, ...cameraLngLat) ??
      map.getCenterElevation();
    for (let i = 0; i < 5; i++) {
      const ground = layer.projectLngLatToScene(cameraLngLat, terrainHeight);
      if (!ground) break;
      const t = (ground.y - photoRay.ray.origin.y) / photoRay.ray.direction.y;
      if (!(t > 0)) break;
      const point = photoRay.ray.at(t, new Vector3());
      const location = layer.projectSceneToLngLat(point);
      if (!location) break;
      const elevation =
        getSharedThreeTerrainElevation(map, ...location) ??
        map.queryTerrainElevation(location);
      if (elevation === null || !Number.isFinite(elevation)) break;
      if (Math.abs(elevation - terrainHeight) < 0.1)
        return { point, surface: "terrain" };
      terrainHeight = elevation;
    }
    return null;
  };
  const intersectSurface = (
    photoRay: Raycaster,
    cameraLngLat: [number, number],
    surfaceMode: PhotoAxisSurfaceMode = "auto"
  ) => {
    if (disposed) return null;
    refreshReceivers();
    const scene = acquireSharedThreeScene(map);
    try {
      return intersectSceneSurface(
        photoRay,
        cameraLngLat,
        scene.layer,
        surfaceMode
      );
    } finally {
      scene.release();
    }
  };
  const pick = async (
    records: ObliqueImageRecord[],
    query: FootprintPointQuery,
    headingFirst: boolean,
    isCurrent: () => boolean,
    screenPoint?: Readonly<{ x: CssPixels; y: CssPixels }>
  ): Promise<ObliqueImageRecord | null | undefined> => {
    if (disposed || !isCurrent()) return undefined;
    if (!screenPoint && records.some((record) => !record.catalogCenter))
      refreshReceivers();
    const physicalTarget = records.some((record) => record.catalogCenter)
      ? await physicalImageQueryTarget({
          longitude: query.point[0],
          latitude: query.point[1],
          heightMeters:
            query.heightMeters ??
            data.imageRecords.get(query.activeImageId ?? "")?.catalogCenter
              ?.heightMeters ??
            data.datasets.get(records[0]?.seriesId)
              ?.referenceGroundHeightMeters ??
            records.find((record) => record.catalogCenter)?.catalogCenter
              ?.heightMeters,
          heightDatum: "dhhn2016",
        })
      : undefined;
    if (disposed || !isCurrent()) return undefined;
    const scene = acquireSharedThreeScene(map);
    const frame = scene.layer.getLocalFrame();
    const origin = scene.layer.projectSceneToLngLat([0, 0, 0]);
    const clip = screenClip?.clone();
    let best: ObliqueImageRecord | null = null;
    let bestHit: AxisHit | null = null;
    let bestDistance = Infinity;
    let bestHeading = Infinity;
    let started = performance.now(),
      batch = 0;
    try {
      for (const record of records) {
        batch++;
        if (batch >= 8 || performance.now() - started > 3) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          started = performance.now();
          batch = 0;
        }
        if (disposed || !isCurrent()) return undefined;
        const dataset = data.datasets.get(record.seriesId);
        if (!dataset) continue;
        const pose = getOrComputeObliquePose(record, dataset);
        const heading =
          query.viewMode === "nadir"
            ? 0
            : Math.abs(
                shortestAngleDelta(
                  query.headingRad,
                  degToRadNumeric(pose.bearingDeg)
                )
              );
        // In a coverage gap heading deviation wins; equal deviations use surface distance.
        if (headingFirst && heading > bestHeading + 1e-8) continue;
        if (!screenPoint && record.catalogCenter) {
          // Catalogue centres never become a live surface query, including API
          // callers without a CSS pointer. Their shortlist already owns coverage.
          const distance = physicalCenterDistance(record, physicalTarget ?? {});
          if (distance === undefined) continue;
          const sameHeading =
            !headingFirst || Math.abs(heading - bestHeading) <= 1e-8;
          if (
            (headingFirst && heading < bestHeading - 1e-8) ||
            (sameHeading &&
              (distance < bestDistance ||
                (distance === bestDistance &&
                  (record.id === query.activeImageId ||
                    (best?.id !== query.activeImageId &&
                      (!best || record.id.localeCompare(best.id) < 0))))))
          ) {
            best = record;
            bestHit = {
              point: [
                record.catalogCenter.longitude,
                record.catalogCenter.latitude,
              ],
              surface: "catalog",
            };
            bestDistance = distance;
            bestHeading = heading;
          }
          continue;
        }
        const cacheKey = screenPoint ? `sensor:${record.id}` : record.id;
        let hit = screenPoint ? undefined : hits.get(cacheKey);
        if (
          screenPoint &&
          hit?.surface === "catalog-reference" &&
          hit.fallbackHeight !== query.heightMeters
        )
          hit = undefined;
        let z = 0;
        if (hit === undefined || screenPoint) {
          let altitude = altitudes.get(record.id);
          if (!altitude) {
            altitude = resolveCameraAltitude(
              record,
              dataset.heightDatum,
              heightOffset,
              dataset.allowUnverifiedSourceHeight
            );
            altitudes.set(record.id, altitude);
          }
          try {
            z = await altitude;
          } catch {
            hits.set(cacheKey, null);
            continue;
          }
          if (disposed || !isCurrent()) return undefined;
        }
        if (!frame || !origin) continue;
        const calibration = screenPoint
          ? getCameraCalibration(dataset, record.cameraId)
          : undefined;
        const sceneToPhoto = screenPoint
          ? sceneToPhotoEnu(origin, frame.sceneFromLocal, pose, z)
          : undefined;
        const projection =
          sceneToPhoto && calibration
            ? imageProjectionMatrix(record, calibration, pose, sceneToPhoto)
            : undefined;
        const rays =
          projection && sceneToPhoto && calibration
            ? photoCenterRays({
                projection,
                sceneToPhoto,
                calibration,
                centerY: 0.5,
              })
            : undefined;
        if (hit === undefined) {
          let center: Vector3 | undefined;
          let surface: AxisHit["surface"] = "catalog-reference";
          if (screenPoint && rays && projection && calibration && clip) {
            const stored = record.catalogCenter;
            if (stored) surface = "catalog";
            if (stored)
              center = presentationPointToScene(
                stored,
                origin,
                frame.sceneFromLocal
              );
            else if (rays.sensor) {
              // Explicit approximation for old catalogs, never a claimed mesh hit.
              const ground = presentationPointToScene(
                {
                  longitude: pose.longitude,
                  latitude: pose.latitude,
                  heightMeters: dataset.referenceGroundHeightMeters ?? 0,
                },
                origin,
                frame.sceneFromLocal
              );
              const up = new Vector3(0, 0, 1).transformDirection(
                sceneToPhoto!.clone().invert()
              );
              center =
                rays.sensor.intersectPlane(
                  new Plane().setFromNormalAndCoplanarPoint(up, ground),
                  new Vector3()
                ) ?? undefined;
            }
            const sample =
              center && rays.axis
                ? screenPointOnPhotoPlane(
                    clip,
                    screenPoint,
                    map.transform,
                    rays.axis.direction,
                    center
                  )
                : null;
            const pixel =
              sample &&
              projectObjectCoveragePoint(projection, sample, calibration);
            if (
              !pixel ||
              pixel.x < 0 ||
              pixel.y < 0 ||
              pixel.x > calibration.widthPx ||
              pixel.y > calibration.heightPx
            )
              continue;
          } else if (!screenPoint) {
            const photoToScene = sceneToPhotoEnu(
              origin,
              frame.sceneFromLocal,
              pose,
              z
            ).invert();
            ray.ray.origin.set(0, 0, 0).applyMatrix4(photoToScene);
            ray.ray.direction
              .set(...pose.direction)
              .transformDirection(photoToScene);
            const surfaceHit = intersectSceneSurface(
              ray,
              [pose.longitude, pose.latitude],
              scene.layer
            );
            center = surfaceHit?.point;
            surface = surfaceHit?.surface ?? "catalog-reference";
          }
          const point = center && scene.layer.projectSceneToLngLat(center);
          hit =
            point && center
              ? {
                  point,
                  surface,
                  ...(screenPoint
                    ? {
                        referencePoint: center
                          .clone()
                          .applyMatrix4(
                            frame.currentToReference ?? new Matrix4()
                          ),
                        ...(surface === "catalog-reference"
                          ? { fallbackHeight: query.heightMeters }
                          : {}),
                      }
                    : {}),
                }
              : null;
          // Bound coordinate cache only; no frustum meshes/textures are allocated.
          if (hits.size >= 2048) hits.delete(hits.keys().next().value!);
          if (!screenPoint) hits.set(cacheKey, hit);
        }
        if (!hit) continue;
        let distance: number;
        if (screenPoint) {
          if (!clip || !hit.referencePoint) continue;
          const point = hit.referencePoint
            .clone()
            .applyMatrix4(frame.referenceToCurrent ?? new Matrix4());
          const projected = new Vector4(
            point.x,
            point.y,
            point.z,
            1
          ).applyMatrix4(clip);
          if (!(projected.w > 0)) continue;
          distance =
            physicalTarget && record.catalogCenter
              ? physicalCenterDistance(record, physicalTarget) ?? Infinity
              : Math.hypot(
                  ((projected.x / projected.w + 1) * map.transform.width) / 2 -
                    screenPoint.x,
                  ((1 - projected.y / projected.w) * map.transform.height) / 2 -
                    screenPoint.y
                );
        } else
          distance = groundDistanceM(
            { lng: query.point[0], lat: query.point[1] },
            { lng: hit.point[0], lat: hit.point[1] }
          );
        const sameHeading =
          !headingFirst || Math.abs(heading - bestHeading) <= 1e-8;
        if (
          (headingFirst && heading < bestHeading - 1e-8) ||
          (sameHeading &&
            (distance < bestDistance ||
              (distance === bestDistance && record.id === query.activeImageId)))
        ) {
          best = record;
          bestHit = hit;
          bestDistance = distance;
          bestHeading = heading;
        }
      }
      if (disposed || !isCurrent()) return undefined;
      emit(
        best && bestHit
          ? {
              imageId: best.sourceId,
              seriesId: best.seriesId,
              distance: (best.catalogCenter && physicalTarget?.ecefMeters
                ? bestDistance
                : groundDistanceM(
                    { lng: query.point[0], lat: query.point[1] },
                    { lng: bestHit.point[0], lat: bestHit.point[1] }
                  )) as Meters,
              surface: bestHit.surface,
            }
          : null
      );
      return best;
    } finally {
      scene.release();
    }
  };
  return {
    pick,
    intersectSurface,
    getSurfaceRevision: () => {
      if (!disposed) refreshReceivers();
      return revision;
    },
    updateData: (nextData: ObliqueSelectionData | null) => {
      if (!nextData || nextData === data) return;
      if (
        nextData.imageRecords !== data.imageRecords ||
        nextData.centers !== data.centers ||
        nextData.datasets !== data.datasets
      ) {
        hits.clear();
        altitudes.clear();
      }
      data = nextData;
    },
    /** Reuse the pointer's sampled ground point; catalog centres are plane estimates. */
    reportPointer: (
      record: ObliqueImageRecord | null | undefined,
      point: [number, number]
    ) => {
      const center = record && data.centers.get(record.id);
      emit(
        record && center
          ? {
              imageId: record.sourceId,
              seriesId: record.seriesId,
              distance: groundDistanceM(
                { lng: point[0], lat: point[1] },
                { lng: center.longitude, lat: center.latitude }
              ) as Meters,
              surface: "catalog-reference",
            }
          : null
      );
    },
    start: () => {
      disposed = false;
      stopFrame?.();
      frameLease?.release();
      frameLease = acquireSharedThreeScene(map);
      stopFrame = frameLease.layer.addBeforeRenderCallback?.(
        ({ renderCamera }) => {
          screenClip = new Matrix4().multiplyMatrices(
            renderCamera.projectionMatrix,
            renderCamera.matrixWorldInverse
          );
        }
      );
      map.on("sourcedata", sourceDataChanged);
      unsubscribeTerrain?.();
      unsubscribeTerrain = subscribeSharedThreeTerrain(map, terrainChanged);
    },
    clearDebug: () => emit(null),
    subscribe: (listener: (value: PhotoAxisDebug) => void) => {
      observers.add(listener);
      listener(snapshot);
      return () => {
        observers.delete(listener);
      };
    },
    dispose: () => {
      disposed = true;
      stopFrame?.();
      stopFrame = undefined;
      frameLease?.release();
      frameLease = undefined;
      screenClip = undefined;
      map.off("sourcedata", sourceDataChanged);
      unsubscribeTerrain?.();
      unsubscribeTerrain = undefined;
      hits.clear();
      receiverRoots = [];
      terrainBounds = [];
      terrainRuntimes = [];
      terrainBoundsFrame = "";
      revision = "";
      intersections.length = 0;
      altitudes.clear();
      observers.clear();
    },
  };
};
