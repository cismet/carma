import type { Map as MaplibreMap } from "maplibre-gl";
import { Matrix4, Sphere, Raycaster, Vector3, type Mesh } from "three";
import {
  acquireSharedThreeScene,
  getSharedThreeSceneRuntimes,
} from "@carma-mapping/engines/maplibre";
import { degToRadNumeric, type Meters } from "@carma-units";
import { shortestAngleDelta } from "@carma-commons/math";
import type {
  ObliqueImageRecord,
  ObliqueSelectionData,
} from "../../core/types";
import type { FootprintPointQuery } from "../../core/utils/viewport-footprints";
import { getCameraCalibration } from "../../core/utils/calibration";
import { projectObjectCoverageSphere } from "../../core/utils/object-coverage";
import { imageProjectionMatrix, sceneToPhotoEnu } from "./image-projection";
import { poseOf, resolveCameraAltitude } from "./flyToImage";
import { groundDistanceM } from "./cameraMath";

export type PhotoAxisDebug = {
  imageId: string;
  seriesId: string;
  distance: Meters;
  surface: "mesh" | "terrain";
} | null;
type AxisHit = { point: [number, number]; surface: "mesh" | "terrain" };

/** The worker filters the full catalog; only eligible photo axes touch live receivers.
 * Ground hits survive pointer/camera movement and are invalidated by receiver/LOD versions.
 */
export const createPhotoAxisPicker = (
  map: MaplibreMap,
  data: ObliqueSelectionData,
  heightOffset: number
) => {
  const hits = new Map<string, AxisHit | null>();
  const projections = new Map<string, Matrix4>();
  let projectionOrigin = "";
  const identity = new Matrix4();
  const pointSphere = new Sphere(new Vector3(), 0.0001);
  const altitudes = new Map<string, Promise<number>>();
  const observers = new Set<(value: PhotoAxisDebug) => void>();
  let snapshot: PhotoAxisDebug = null;
  let revision = "";
  let nativeRevision = 0;
  let disposed = false;
  let meshes: Mesh[] = [];
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
  const refreshReceivers = () => {
    const runtimes = getSharedThreeSceneRuntimes(map);
    const receivers = runtimes.filter(
      (runtime) =>
        runtime.root.visible &&
        (runtime.providesTerrain || runtime.receivesMapStyleTexture)
    );
    const nextRevision =
      runtimes
        .map((runtime) =>
          [
            runtime.id,
            runtime.root.visible,
            runtime.mapStyleProjectionVersion?.() ?? 0,
          ].join(":")
        )
        .join("|") +
      ":" +
      nativeRevision;
    if (nextRevision !== revision) {
      revision = nextRevision;
      hits.clear();
      meshes = [];
      for (const receiver of receivers)
        receiver.root.traverseVisible((object) => {
          const mesh = object as Mesh;
          if (mesh.isMesh && mesh.geometry) meshes.push(mesh);
        });
    }
  };
  const intersectSceneSurface = (
    photoRay: Raycaster,
    cameraLngLat: [number, number],
    layer: ReturnType<typeof acquireSharedThreeScene>["layer"]
  ): { point: Vector3; surface: "mesh" | "terrain" } | null => {
    const surfaceHit = photoRay.intersectObjects(meshes, false)[0];
    if (surfaceHit) return { point: surfaceHit.point, surface: "mesh" };
    if (photoRay.ray.direction.y >= -1e-6) return null;
    let terrainHeight = map.getCenterElevation();
    for (let i = 0; i < 5; i++) {
      const ground = layer.projectLngLatToScene(cameraLngLat, terrainHeight);
      if (!ground) break;
      const t = (ground.y - photoRay.ray.origin.y) / photoRay.ray.direction.y;
      if (!(t > 0)) break;
      const point = photoRay.ray.at(t, new Vector3());
      const location = layer.projectSceneToLngLat(point);
      if (!location) break;
      const elevation = map.queryTerrainElevation(location);
      if (elevation === null || !Number.isFinite(elevation)) break;
      if (Math.abs(elevation - terrainHeight) < 0.1)
        return { point, surface: "terrain" };
      terrainHeight = elevation;
    }
    return null;
  };
  const intersectSurface = (
    photoRay: Raycaster,
    cameraLngLat: [number, number]
  ) => {
    if (disposed) return null;
    refreshReceivers();
    const scene = acquireSharedThreeScene(map);
    try {
      return intersectSceneSurface(photoRay, cameraLngLat, scene.layer);
    } finally {
      scene.release();
    }
  };
  const pick = async (
    records: ObliqueImageRecord[],
    query: FootprintPointQuery,
    headingFirst: boolean,
    isCurrent: () => boolean
  ): Promise<ObliqueImageRecord | null | undefined> => {
    if (disposed || !isCurrent()) return undefined;
    refreshReceivers();
    const scene = acquireSharedThreeScene(map);
    const frame = scene.layer.getLocalFrame();
    const origin = scene.layer.projectSceneToLngLat([0, 0, 0]);
    const resolutionSelection = query.selectionStrategy === "best-resolution";
    let physicalPoint: Vector3 | null = null;
    if (
      resolutionSelection &&
      frame &&
      origin &&
      Number.isFinite(query.heightMeters)
    ) {
      const key = origin.join("|");
      if (projectionOrigin !== key) {
        projectionOrigin = key;
        projections.clear();
      }
      physicalPoint =
        scene.layer
          .projectLngLatToScene(query.point, query.heightMeters!)
          ?.applyMatrix4(frame.sceneFromLocal.clone().invert()) ?? null;
      if (physicalPoint) pointSphere.center.copy(physicalPoint);
    }
    let best: ObliqueImageRecord | null = null;
    let bestHit: AxisHit | null = null;
    let bestDistance = Infinity;
    let bestHeading = Infinity;
    let bestDensity = 0;
    let started = performance.now(),
      batch = 0;
    try {
      for (const record of records) {
        if (disposed || !isCurrent()) return undefined;
        const dataset = data.datasets.get(record.seriesId);
        if (!dataset) continue;
        const pose = poseOf(record, dataset);
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
        let hit = hits.get(record.id);
        let z = 0;
        if (
          hit === undefined ||
          (resolutionSelection && physicalPoint && !projections.has(record.id))
        ) {
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
            hits.set(record.id, null);
            continue;
          }
          if (disposed || !isCurrent()) return undefined;
        }
        if (!frame || !origin) continue;
        if (hit === undefined) {
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
          const point =
            surfaceHit && scene.layer.projectSceneToLngLat(surfaceHit.point);
          hit =
            point && surfaceHit ? { point, surface: surfaceHit.surface } : null;
          // Bound coordinate cache only; no frustum meshes/textures are allocated.
          if (hits.size >= 2048) hits.delete(hits.keys().next().value!);
          hits.set(record.id, hit);
        }
        if (!hit) continue;
        const distance = groundDistanceM(
          { lng: query.point[0], lat: query.point[1] },
          { lng: hit.point[0], lat: hit.point[1] }
        );
        let density = 0;
        if (
          resolutionSelection &&
          physicalPoint &&
          origin &&
          dataset.heightDatum !== "unknown"
        ) {
          const calibration = getCameraCalibration(dataset, record.cameraId);
          let projection = projections.get(record.id);
          if (!projection) {
            projection = imageProjectionMatrix(
              record,
              calibration,
              pose,
              sceneToPhotoEnu(origin, identity, pose, z)
            );
            if (projections.size >= 2048)
              projections.delete(projections.keys().next().value!);
            projections.set(record.id, projection);
          }
          density =
            projectObjectCoverageSphere(projection, pointSphere, calibration)
              ?.pixelsPerMeter ?? 0;
        }
        const sameDensity =
          !resolutionSelection || Math.abs(density - bestDensity) <= 1e-8;
        const sameHeading =
          !headingFirst || Math.abs(heading - bestHeading) <= 1e-8;
        if (
          (headingFirst && heading < bestHeading - 1e-8) ||
          (sameHeading &&
            ((resolutionSelection && density > bestDensity + 1e-8) ||
              (sameDensity &&
                (distance < bestDistance ||
                  (distance === bestDistance &&
                    record.id === query.activeImageId)))))
        ) {
          best = record;
          bestHit = hit;
          bestDistance = distance;
          bestHeading = heading;
          bestDensity = density;
        }
        batch++;
        if (batch >= 8 || performance.now() - started > 3) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          started = performance.now();
          batch = 0;
        }
      }
      if (disposed || !isCurrent()) return undefined;
      emit(
        best && bestHit
          ? {
              imageId: best.sourceId,
              seriesId: best.seriesId,
              distance: bestDistance as Meters,
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
    start: () => {
      disposed = false;
      map.on("sourcedata", sourceDataChanged);
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
      map.off("sourcedata", sourceDataChanged);
      hits.clear();
      altitudes.clear();
      projections.clear();
      observers.clear();
    },
  };
};
