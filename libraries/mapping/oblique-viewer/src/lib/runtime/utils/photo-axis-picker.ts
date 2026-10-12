import type { Map as MaplibreMap } from "maplibre-gl";
import {
  InstancedMesh,
  Matrix3,
  Matrix4,
  Plane,
  Raycaster,
  Vector3,
  type Box3,
  type Intersection,
  type Object3D,
} from "three";
import {
  acquireSharedThreeScene,
  createBestImageAreaCache,
  type BestImageAreaCache,
  getSharedThreeSceneRuntimes,
  getSharedThreeTerrainElevation,
  getSharedThreeTerrainElevations,
  subscribeSharedThreeTerrain,
} from "@carma-mapping/engines/maplibre";
import type { RasterDemTerrainRuntime } from "@carma-mapping/engines/maplibre/terrain";
import { type CssPixels, type Degrees, type Meters } from "@carma-units";
import { createLocalEcefFrame } from "@carma-geo/proj";
import type {
  ObliqueDataset,
  ObliqueGroundTarget,
  ObliqueImageRecord,
  ObliqueSelectionData,
} from "../../core/types";
import type { FootprintPointQuery } from "../../core/utils/viewport-footprints";
import { getMeanPhotoReference } from "../../core/utils/imageRecord";
import { getOrComputeObliquePose } from "../../core/utils/oblique-pose";
import {
  imageProjectionMatrix,
  sceneToPhotoEnu,
} from "../../core/utils/image-projection";
import { getCameraCalibration } from "../../core/utils/calibration";
import {
  photoCenterRayUv,
  photoCenterRays,
  photoReferenceRays,
  presentationPointToScene,
} from "../../core/utils/photo-center-rays";
import {
  type BestImageGeometry,
  type BestImageRank,
} from "../../core/utils/best-image";
import { resolveCameraAltitude } from "./flyToImage";
import { groundDistanceM } from "./cameraMath";

export type PhotoAxisDebug = {
  imageId: string;
  seriesId: string;
  distance: Meters;
  surface: "mesh" | "terrain" | "catalog" | "catalog-reference";
} | null;
export type PhotoAxisSurfaceMode = "auto" | "mesh" | "terrain";
export type PhotoAxisBestImageOptions = Readonly<{
  target: ObliqueGroundTarget;
  preferredPitchDeg?: Degrees;
  activeImageId?: string | null;
  isCurrent?: () => boolean;
}>;
export type PrepareBestGeometryOptions = Readonly<{
  preferredPitchDeg?: Degrees;
  activeImageId?: string | null;
  isCurrent?: () => boolean;
  /** Classic boundary display only: replace the field with this bounded window. */
  localField?: boolean;
}>;
export type PreparedBestImageGeometry = Readonly<{
  record: ObliqueImageRecord;
  geometry: BestImageGeometry;
}>;
export type PreparedBestImageField = Readonly<{
  entries: readonly PreparedBestImageGeometry[];
  sceneToMetric: Matrix4;
  referenceToMetric: Matrix4;
  cache: BestImageAreaCache;
  eligibleIds: ReadonlySet<string>;
}>;
/** The worker filters the full catalog; only eligible photo axes touch live receivers.
 * Ground hits survive pointer/camera movement and are invalidated by receiver/LOD versions.
 */
export const createPhotoAxisPicker = (
  map: MaplibreMap,
  data: ObliqueSelectionData,
  heightOffset: number,
  options: {
    readPreferredPitchDeg?: () => Degrees | null | undefined;
    readPreferredPitchOverrideDeg?: () => Degrees | null;
    readSeriesDirection?: () => boolean;
    /** Full enabled/filtered heading group, independent of visible or nearest-N lists. */
    readBestRecords?: () => readonly ObliqueImageRecord[];
    /** Classic uses a bounded local field for all best-image queries. */
    readLocalBestField?: () => boolean;
  } = {}
) => {
  let areaCache = createBestImageAreaCache();
  let fieldRecordRevision = 0;
  let fieldIsLocal = false;
  let preparedFieldKey = "";
  let preparedField: Map<string, PreparedBestImageGeometry> | undefined;
  const fieldRecords = new Map<string, ObliqueImageRecord>();
  let fieldOrigin: [number, number] | undefined;
  let fieldPreparation: Promise<unknown> = Promise.resolve();
  const altitudes = new Map<string, Promise<number>>();
  const bestGeometryCache = new Map<
    string,
    {
      record: ObliqueImageRecord;
      dataset: ObliqueDataset;
      calibration: ReturnType<typeof getCameraCalibration>;
      pose: ReturnType<typeof getOrComputeObliquePose>;
      cameraAltitude: number;
      preferredPitch: Degrees | undefined;
      preferredHeading?: Degrees;
      seriesDirection: boolean;
      originKey: string;
      frameKey: string;
      surfaceRevision: string;
      geometry: BestImageGeometry;
    }
  >();
  let dataGeneration = 0;
  const readReferencePreference = (query: PrepareBestGeometryOptions) => {
    const seriesDirection = options.readSeriesDirection?.() ?? false;
    const pitchOverride = options.readPreferredPitchOverrideDeg
      ? options.readPreferredPitchOverrideDeg()
      : query.preferredPitchDeg ?? options.readPreferredPitchDeg?.() ?? null;
    return { seriesDirection, pitchOverride };
  };
  const prepareBestGeometryInFrame = async (
    records: readonly ObliqueImageRecord[],
    preferredPitch: Degrees,
    preference: { seriesDirection: boolean; pitchOverride: Degrees | null },
    origin: [number, number],
    frame: { sceneFromLocal: Matrix4; revision?: string | number },
    surfaceRevision: string,
    isCurrent: () => boolean
  ): Promise<PreparedBestImageGeometry[] | undefined> => {
    const originKey = origin.join(",");
    const frameKey = `${
      frame.revision ?? ""
    }|${frame.sceneFromLocal.elements.join(",")}`;
    const prepared: PreparedBestImageGeometry[] = [];
    let started = performance.now();
    let batch = 0;
    for (const record of records) {
      if (disposed || !isCurrent()) return undefined;
      if (++batch >= 128 || performance.now() - started > 4) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        started = performance.now();
        batch = 0;
        if (disposed || !isCurrent()) return undefined;
      }
      const dataset = data.datasets.get(record.seriesId);
      if (!dataset) continue;
      try {
        const pose = getOrComputeObliquePose(record, dataset);
        const calibration = getCameraCalibration(dataset, record.cameraId);
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
        const cameraAltitude = await altitude;
        if (disposed || !isCurrent()) return undefined;
        const reference = preference.seriesDirection
          ? getMeanPhotoReference(data, record, preference.pitchOverride)
          : { pitchDeg: preferredPitch, headingDeg: undefined };
        const cached = bestGeometryCache.get(record.id);
        if (
          cached &&
          cached.record === record &&
          cached.dataset === dataset &&
          cached.calibration === calibration &&
          cached.pose === pose &&
          cached.cameraAltitude === cameraAltitude &&
          cached.preferredPitch === reference?.pitchDeg &&
          cached.preferredHeading === reference?.headingDeg &&
          cached.seriesDirection === preference.seriesDirection &&
          cached.originKey === originKey &&
          cached.frameKey === frameKey &&
          cached.surfaceRevision === surfaceRevision
        ) {
          bestGeometryCache.delete(record.id);
          bestGeometryCache.set(record.id, cached);
          prepared.push({ record, geometry: cached.geometry });
          continue;
        }
        const sceneToPhoto = sceneToPhotoEnu(
          origin,
          frame.sceneFromLocal,
          pose,
          cameraAltitude
        );
        const projection = imageProjectionMatrix(
          record,
          calibration,
          pose,
          sceneToPhoto
        );
        const rayOptions = { projection, sceneToPhoto, calibration };
        const rays = reference
          ? photoReferenceRays(rayOptions, reference)
          : photoCenterRays({ ...rayOptions, centerY: 0.5 });
        const centerY = photoCenterRayUv(projection, rays.preferred)?.y;
        if (!rays.preferred) continue;
        const geometry: BestImageGeometry = {
          projection,
          eye: rays.eye,
          preferredDirection: rays.preferred.direction,
          centerY,
        };
        bestGeometryCache.delete(record.id);
        bestGeometryCache.set(record.id, {
          record,
          dataset,
          calibration,
          pose,
          cameraAltitude,
          preferredPitch: reference?.pitchDeg,
          preferredHeading: reference?.headingDeg,
          seriesDirection: preference.seriesDirection,
          originKey,
          frameKey,
          surfaceRevision,
          geometry,
        });
        prepared.push({ record, geometry });
      } catch {
        // Invalid metadata on one camera does not hide other ranked images.
      }
    }
    return prepared;
  };
  const observers = new Set<(value: PhotoAxisDebug) => void>();
  let snapshot: PhotoAxisDebug = null;
  let revision = "";
  let nativeRevision = 0;
  let unsubscribeTerrain: (() => void) | undefined;
  const terrainChanged = () => {
    nativeRevision++;
  };
  let disposed = false;
  let receiverRoots: Object3D[] = [];
  let terrainBounds: readonly Box3[] = [];
  let terrainRuntimes: Partial<RasterDemTerrainRuntime>[] = [];
  let terrainBoundsFrame = "";
  let terrainRayCovered = false;
  const prepareBestField = async (
    records: readonly ObliqueImageRecord[],
    query: PrepareBestGeometryOptions = {}
  ): Promise<PreparedBestImageField | undefined> => {
    const localField =
      query.localField ?? options.readLocalBestField?.() ?? false;
    const preference = readReferencePreference(query);
    const requestDataGeneration = dataGeneration;
    const preferredPitch =
      query.preferredPitchDeg ??
      options.readPreferredPitchDeg?.() ??
      (data.imageRecords.get(query.activeImageId ?? "")?.pose?.pitchDeg as
        | Degrees
        | undefined) ??
      (map.getPitch() as Degrees);
    const current = () =>
      !disposed &&
      (query.isCurrent?.() ?? true) &&
      dataGeneration === requestDataGeneration &&
      (query.localField ?? options.readLocalBestField?.() ?? false) ===
        localField &&
      (options.readSeriesDirection?.() ?? false) ===
        preference.seriesDirection &&
      (!options.readPreferredPitchOverrideDeg ||
        options.readPreferredPitchOverrideDeg() === preference.pitchOverride);
    const prepare = async (): Promise<PreparedBestImageField | undefined> => {
      if (
        !current() ||
        !Number.isFinite(preferredPitch) ||
        preferredPitch < 0 ||
        preferredPitch > 90
      )
        return undefined;
      const scene = acquireSharedThreeScene(map);
      try {
        const frame = scene.layer.getLocalFrame();
        const origin = scene.layer.projectSceneToLngLat([0, 0, 0]);
        if (!frame || !origin) return undefined;
        fieldOrigin ??= [...origin];
        // A fixed catalog metric frame survives panning, receiver LOD and scene rebase.
        const sceneToMetric = createLocalEcefFrame(
          fieldOrigin[0],
          fieldOrigin[1]
        )
          .localFromEcef.clone()
          .multiply(createLocalEcefFrame(origin[0], origin[1]).ecefFromLocal)
          .multiply(frame.sceneFromLocal.clone().invert());
        if (fieldIsLocal !== localField) {
          fieldRecords.clear();
          fieldRecordRevision++;
          fieldIsLocal = localField;
        }
        if (localField) {
          const nextIds = new Set(records.map((record) => record.id));
          for (const id of fieldRecords.keys()) {
            if (!nextIds.has(id)) {
              fieldRecords.delete(id);
              fieldRecordRevision++;
            }
          }
        }
        for (const record of localField
          ? records
          : [...(options.readBestRecords?.() ?? []), ...records]) {
          if (fieldRecords.get(record.id) !== record) {
            fieldRecords.set(record.id, record);
            fieldRecordRevision++;
          }
        }
        // Reference totals can be mutated as catalog chunks arrive: compare
        // numeric values, not only the summary/Map identities.
        const means = preference.seriesDirection
          ? [
              ...(data.obliqueReferenceByDirectionBySeries?.entries() ?? []),
            ].map(([series, directions]) => [
              series,
              [...directions.entries()].map(([direction, totals]) => [
                direction,
                totals.opticalPitchSumRad,
                totals.headingSinSum,
                totals.headingCosSum,
                totals.imageCount,
              ]),
            ])
          : null;
        const key = JSON.stringify([
          dataGeneration,
          fieldRecordRevision,
          preference.seriesDirection,
          preference.pitchOverride,
          preference.seriesDirection ? null : preferredPitch,
          means,
        ]);
        if (key !== preparedFieldKey || !preparedField) {
          const prepared = await prepareBestGeometryInFrame(
            [...fieldRecords.values()],
            preferredPitch,
            preference,
            fieldOrigin,
            { sceneFromLocal: new Matrix4() },
            "catalog",
            current
          );
          if (!prepared || !current()) return undefined;
          // Durable numeric cell indices are safe only for immutable catalog
          // revisions and this exact bounded source membership. The worker also
          // hashes the final calibrated matrices before reading stored cells.
          const catalogVersions = localField
            ? [...new Set(prepared.map(({ record }) => record.seriesId))]
                .sort()
                .map((seriesId) => [
                  seriesId,
                  data.datasets.get(seriesId)?.catalogVersion?.trim(),
                ])
            : [];
          const persistenceKey =
            localField &&
            catalogVersions.length &&
            catalogVersions.every(([, version]) => !!version)
              ? JSON.stringify([
                  "best-image-axis-cells-v1",
                  catalogVersions,
                  heightOffset,
                  fieldOrigin,
                  preference.seriesDirection,
                  preference.pitchOverride,
                  preferredPitch,
                  prepared.map(({ record }) => record.id).sort(),
                ])
              : undefined;
          areaCache.updateSites(
            prepared.map(({ record, geometry }) => ({
              id: record.id,
              sceneToImage: geometry.projection,
              eye: geometry.eye,
              direction: geometry.preferredDirection,
            })),
            persistenceKey
          );
          preparedField = new Map(
            prepared.map((entry) => [entry.record.id, entry])
          );
          preparedFieldKey = key;
        }
        const entriesById = preparedField;
        return {
          entries: records.flatMap((record) =>
            entriesById.get(record.id) ? [entriesById.get(record.id)!] : []
          ),
          sceneToMetric,
          referenceToMetric: sceneToMetric.clone(),
          cache: areaCache,
          eligibleIds: new Set(records.map((record) => record.id)),
        };
      } finally {
        scene.release();
      }
    };
    const pending = fieldPreparation.then(prepare, prepare);
    fieldPreparation = pending;
    return pending;
  };
  const rankBest = async (
    records: readonly ObliqueImageRecord[],
    query: PhotoAxisBestImageOptions
  ): Promise<BestImageRank[] | undefined> => {
    const field = await prepareBestField(records, query);
    if (!field || !fieldOrigin || disposed || !(query.isCurrent?.() ?? true))
      return undefined;
    // The receiver presentation uses DHHN-valued ECEF; do not insert physical
    // ellipsoidal target heights into a differently referenced camera field.
    const point = presentationPointToScene(
      { ...query.target, heightMeters: query.target.heightMeters ?? 0 },
      fieldOrigin,
      new Matrix4()
    );
    const ranks = await areaCache.rank(point, {
      activeId: query.activeImageId,
      eligibleIds: field.eligibleIds,
    });
    if (!ranks || disposed || !(query.isCurrent?.() ?? true)) return undefined;
    const byId = new Map(
      field.entries.map((entry) => [entry.record.id, entry])
    );
    return ranks.flatMap((rank) => {
      const entry = byId.get(rank.id);
      return entry
        ? [
            {
              record: entry.record,
              deviation: (1 - rank.score) as import("@carma-units").Ratio,
              imagePoint: rank.imagePoint,
              centerY: entry.geometry.centerY,
            },
          ]
        : [];
    });
  };
  const resolveBest = async (
    records: readonly ObliqueImageRecord[],
    query: PhotoAxisBestImageOptions
  ): Promise<BestImageRank | null | undefined> => {
    const field = await prepareBestField(records, query);
    if (!field || !fieldOrigin || disposed || !(query.isCurrent?.() ?? true))
      return undefined;
    const point = presentationPointToScene(
      { ...query.target, heightMeters: query.target.heightMeters ?? 0 },
      fieldOrigin,
      new Matrix4()
    );
    const winner = await areaCache.resolve(point, {
      activeId: query.activeImageId,
      eligibleIds: field.eligibleIds,
    });
    if (disposed || !(query.isCurrent?.() ?? true) || winner === undefined)
      return undefined;
    if (!winner) return null;
    const entry = bestGeometryCache.get(winner.id);
    return entry
      ? {
          record: entry.record,
          deviation: (1 - winner.score) as import("@carma-units").Ratio,
          imagePoint: winner.imagePoint,
          centerY: entry.geometry.centerY,
        }
      : null;
  };
  const prepareBestGeometry = async (
    records: readonly ObliqueImageRecord[],
    query: PrepareBestGeometryOptions
  ): Promise<PreparedBestImageGeometry[] | undefined> => {
    const field = await prepareBestField(records, query);
    if (!field) return undefined;
    const inverse = field.sceneToMetric.clone().invert();
    return field.entries.map(({ record, geometry }) => ({
      record,
      geometry: {
        ...geometry,
        projection: geometry.projection.clone().multiply(field.sceneToMetric),
        eye: geometry.eye.clone().applyMatrix4(inverse),
        preferredDirection: geometry.preferredDirection
          .clone()
          .transformDirection(inverse),
      },
    }));
  };
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
    _headingFirst: boolean,
    isCurrent: () => boolean,
    _screenPoint?: Readonly<{ x: CssPixels; y: CssPixels }>
  ): Promise<ObliqueImageRecord | null | undefined> => {
    if (disposed || !isCurrent()) return undefined;
    const eligible =
      query.viewMode === "nadir"
        ? records
        : options.readBestRecords?.() ?? records;
    const height =
      query.heightMeters ??
      getSharedThreeTerrainElevation(map, query.point[0], query.point[1]) ??
      data.datasets.get(eligible[0]?.seriesId)?.referenceGroundHeightMeters;
    if (!Number.isFinite(height)) return null;
    const target: ObliqueGroundTarget = {
      longitude: query.point[0],
      latitude: query.point[1],
      heightMeters: height,
      heightDatum: "dhhn2016",
    };
    const winner = await resolveBest(eligible, {
      target,
      activeImageId: query.activeImageId,
      isCurrent,
    });
    if (disposed || !isCurrent()) return undefined;
    return winner === undefined ? undefined : winner?.record ?? null;
  };
  return {
    rankBest,
    resolveBest,
    prepareBestField,
    prepareBestGeometry,
    pick,
    intersectSurface,
    getSurfaceRevision: () => {
      if (!disposed) refreshReceivers();
      return revision;
    },
    updateData: (nextData: ObliqueSelectionData | null) => {
      if (!nextData || nextData === data) return;
      dataGeneration++;
      if (
        nextData.imageRecords !== data.imageRecords ||
        nextData.centers !== data.centers ||
        nextData.datasets !== data.datasets
      ) {
        altitudes.clear();
        bestGeometryCache.clear();
        fieldRecords.clear();
        areaCache.updateSites([]);
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
      if (disposed) areaCache = createBestImageAreaCache();
      disposed = false;
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
      dataGeneration++;
      preparedField = undefined;
      preparedFieldKey = "";
      map.off("sourcedata", sourceDataChanged);
      unsubscribeTerrain?.();
      unsubscribeTerrain = undefined;
      bestGeometryCache.clear();
      fieldRecords.clear();
      areaCache.dispose();
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

export type PhotoAxisPicker = ReturnType<typeof createPhotoAxisPicker>;
