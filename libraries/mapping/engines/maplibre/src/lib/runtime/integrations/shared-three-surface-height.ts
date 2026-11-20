import type { LngLat, Map as MaplibreMap, Point } from "maplibre-gl";
import {
  Raycaster,
  Sphere,
  Vector3,
  type BufferGeometry,
  type Object3D,
} from "three";

import type {
  SharedThreeSceneLayer,
  SharedThreeSceneRuntime,
} from "../../core/shared-three-scene-types";
import { getSharedThreeSceneRuntimes } from "./shared-three-scene-content-registry";
import {
  getSharedThreeSceneLayer,
  getSharedThreeSceneLayerRuntimes,
} from "./shared-three-scene-registry";

const isVisibleRoot = (root: Object3D) => {
  for (let object: Object3D | null = root; object; object = object.parent) {
    if (!object.visible) return false;
  }
  return true;
};

/**
 * What counts as a drawn 3D surface: 3D Tiles (meshes, tilesets) and
 * Three.js terrain. Overlays, draped receivers and MapLibre's own terrain do
 * not count.
 */
const isSurfaceRuntime = (runtime: SharedThreeSceneRuntime) =>
  Boolean(
    runtime.providesTerrain ||
      typeof runtime.getActiveTileVolumes === "function"
  );

/**
 * The visible 3D surfaces: registered content and whatever else the shared
 * layer draws (the shadow simulation's terrain).
 */
export const getSharedThreeSurfaceRuntimes = (
  map: MaplibreMap
): SharedThreeSceneRuntime[] =>
  [
    ...new Set([
      ...getSharedThreeSceneRuntimes(map),
      ...getSharedThreeSceneLayerRuntimes(map),
    ]),
  ].filter(
    (runtime) => isSurfaceRuntime(runtime) && isVisibleRoot(runtime.root)
  );

/** Whether any drawn 3D surface still has tiles to load for the current view. */
export const isSharedThreeSurfaceLoading = (map: MaplibreMap): boolean =>
  getSharedThreeSurfaceRuntimes(map).some(
    (runtime) => (runtime.getRequestDemand?.() ?? 0) > 0
  );

const RAY_START_ALTITUDE_METERS = 9000;
const RAY_END_ALTITUDE_METERS = -500;
/** Address points sit at entrances and facades, next to the roof they name. */
const RING_RADIUS_METERS = 3;
const RING_SAMPLES = 8;
const METERS_PER_DEGREE_LATITUDE = 111_320;

const ringAround = ([longitude, latitude]: [number, number]) => {
  const latitudeStep = RING_RADIUS_METERS / METERS_PER_DEGREE_LATITUDE;
  const longitudeStep = latitudeStep / Math.cos((latitude * Math.PI) / 180);
  return Array.from({ length: RING_SAMPLES }, (_, index) => {
    const angle = (2 * Math.PI * index) / RING_SAMPLES;
    return [
      longitude + Math.cos(angle) * longitudeStep,
      latitude + Math.sin(angle) * latitudeStep,
    ] as [number, number];
  });
};

/**
 * The highest drawn 3D surface at a coordinate or on a 3 m ring around it,
 * as a MapLibre altitude in metres; null where nothing is drawn. Straight-down
 * rays in the scene, which is MapLibre's own projected space, so the result
 * shares MapLibre terrain's height reference.
 */
export const pickTopSurfaceAltitude = (
  runtimes: readonly SharedThreeSceneRuntime[],
  projectLngLatToScene: SharedThreeSceneLayer["projectLngLatToScene"],
  lngLat: [number, number]
): number | null => {
  const ground = projectLngLatToScene(lngLat, 0);
  const meterUp = projectLngLatToScene(lngLat, 1);
  if (!ground || !meterUp) return null;
  const sceneUnitsPerMeter = meterUp.y - ground.y;
  if (!(sceneUnitsPerMeter > 0)) return null;

  let top: number | null = null;
  const raise = (altitude: number | undefined) => {
    if (
      altitude !== undefined &&
      Number.isFinite(altitude) &&
      (top === null || altitude > top)
    ) {
      top = altitude;
    }
  };

  const terrains = runtimes.filter((runtime) => runtime.getDrawnElevation);
  const candidates: { object: Object3D; sphere: Sphere }[] = [];
  for (const runtime of runtimes) {
    if (runtime.getDrawnElevation) continue;
    runtime.root.traverseVisible((object) => {
      const geometry = (object as Object3D & { geometry?: BufferGeometry })
        .geometry;
      if (!geometry) return;
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      if (!geometry.boundingSphere) return;
      candidates.push({
        object,
        sphere: geometry.boundingSphere
          .clone()
          .applyMatrix4(object.matrixWorld),
      });
    });
  }

  const raycaster = new Raycaster();
  // three-mesh-bvh accelerated tiles stop at the first hit.
  (raycaster as Raycaster & { firstHitOnly: boolean }).firstHitOnly = true;
  raycaster.far =
    (RAY_START_ALTITUDE_METERS - RAY_END_ALTITUDE_METERS) * sceneUnitsPerMeter;
  const down = new Vector3(0, -1, 0);
  const origin = new Vector3();

  for (const sample of [lngLat, ...ringAround(lngLat)]) {
    for (const terrain of terrains) {
      raise(terrain.getDrawnElevation?.(sample[0], sample[1]));
    }
    if (!projectLngLatToScene(sample, RAY_START_ALTITUDE_METERS, origin)) {
      continue;
    }
    raycaster.set(origin, down);
    for (const { object, sphere } of candidates) {
      if (!raycaster.ray.intersectsSphere(sphere)) continue;
      const hit = raycaster.intersectObject(object, false)[0];
      if (hit) raise((hit.point.y - ground.y) / sceneUnitsPerMeter);
    }
  }
  return top;
};

type TerrainArgument = Parameters<
  MaplibreMap["transform"]["locationToScreenPoint"]
>[1];

/** Screen point of a coordinate at a MapLibre altitude in metres. */
export const projectLngLatAtAltitude = (
  map: MaplibreMap,
  lngLat: LngLat,
  altitude: number
): Point => {
  // locationToScreenPoint only asks the terrain for the elevation to use
  const atAltitude = {
    getElevationForLngLat: () => altitude,
  } as unknown as TerrainArgument;
  return map.transform.locationToScreenPoint(lngLat, atAltitude);
};

/** `pickTopSurfaceAltitude` against what the map's shared layer draws right now. */
export const pickSharedThreeSurfaceAltitude = (
  map: MaplibreMap,
  lngLat: [number, number]
): number | null => {
  const layer = getSharedThreeSceneLayer(map);
  const runtimes = getSharedThreeSurfaceRuntimes(map);
  if (!layer || runtimes.length === 0) return null;
  return pickTopSurfaceAltitude(
    runtimes,
    (position, altitude, target) =>
      layer.projectLngLatToScene(position, altitude, target),
    lngLat
  );
};
