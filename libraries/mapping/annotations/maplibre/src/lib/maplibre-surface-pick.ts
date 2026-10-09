import type { Map as MaplibreMap } from "maplibre-gl";
import { Raycaster, Vector3, type Object3D } from "three";
import {
  getSharedThreeSceneRuntimes,
  subscribeSharedThreeSceneContent,
  type SharedThreeSceneRuntime,
} from "@carma-mapping/engines/maplibre";
import {
  GUIDE_NORMAL_EPSILON_SQUARED,
  ecefFromGeographicCoordinate,
  getLocalUpDirectionAtAnchor,
} from "@carma-mapping/annotations/core";
import type {
  AnnotationScreenPosition,
  AnnotationSurfacePick,
  AnnotationSurfacePickOptions,
} from "@carma-mapping/annotations/runtime";

import type { MapLibreAnnotationScene } from "./maplibre-annotation-scene";

/**
 * Surface picking against the shared Three.js scene, the way the oblique
 * viewer's query cursor reads its view anchor: a ray through the pointer,
 * the first hit on a visible runtime that provides terrain or receives the
 * map style (meshes, tilesets, Three terrain), MapLibre's own terrain as the
 * ground fallback. Port of the Cesium `resolvePreferredSurfacePick` and
 * `sampleSurfacePickNormalAtScreenPosition` semantics.
 */

/** Cesium's `POINTER_NORMAL_SAMPLE_OFFSET_PX`. */
const POINTER_NORMAL_SAMPLE_OFFSET_PX = 2;

const isVisibleRoot = (root: Object3D) => {
  for (let object: Object3D | null = root; object; object = object.parent) {
    if (!object.visible) return false;
  }
  return true;
};

/** Tile runtimes (meshes, tilesets), Three terrain and draped receivers; never overlays. */
const isSurfaceRuntime = (runtime: SharedThreeSceneRuntime) =>
  Boolean(
    runtime.providesTerrain ||
      runtime.receivesMapStyleTexture ||
      typeof runtime.getActiveTileVolumes === "function"
  );

/** Roots the pointer can land on; annotation roots are never among them. */
export const getMapLibreSurfaceRoots = (map: MaplibreMap): Object3D[] =>
  getSharedThreeSceneRuntimes(map)
    .filter(
      (runtime) => isSurfaceRuntime(runtime) && isVisibleRoot(runtime.root)
    )
    .map((runtime) => runtime.root);

/** A mesh or tileset is drawn through the shared Three.js layer right now. */
export const hasMapLibreAnnotationSurfaces = (
  map: MaplibreMap | null | undefined
): boolean =>
  Boolean(map) &&
  getSharedThreeSceneRuntimes(map!).some(
    (runtime) => isSurfaceRuntime(runtime) && isVisibleRoot(runtime.root)
  );

/** Re-evaluates `hasMapLibreAnnotationSurfaces` whenever the shared scene content changes. */
export const subscribeMapLibreAnnotationSurfaces = (
  map: MaplibreMap,
  listener: (available: boolean) => void
): (() => void) => {
  listener(hasMapLibreAnnotationSurfaces(map));
  return subscribeSharedThreeSceneContent(map, () => {
    listener(hasMapLibreAnnotationSurfaces(map));
  });
};

const createSurfaceRaycaster = () => {
  const raycaster = new Raycaster();
  // three-mesh-bvh accelerated tiles stop at the first hit.
  (raycaster as Raycaster & { firstHitOnly: boolean }).firstHitOnly = true;
  return raycaster;
};

export type MapLibreSurfacePicker = {
  resolveSurfacePick: (
    screenPosition: AnnotationScreenPosition,
    options?: AnnotationSurfacePickOptions
  ) => AnnotationSurfacePick;
  sampleSurfaceNormalAt: (
    screenPosition: AnnotationScreenPosition,
    centerECEF: Vector3
  ) => Vector3 | null;
  /** Something of the scene sits between the camera and the point. */
  isPointOccluded: (positionECEF: Vector3, toleranceMeters: number) => boolean;
};

export const createMapLibreSurfacePicker = (
  scene: MapLibreAnnotationScene
): MapLibreSurfacePicker => {
  const raycaster = createSurfaceRaycaster();
  const occlusionRaycaster = createSurfaceRaycaster();

  const pickSceneSurface = (
    screenPosition: AnnotationScreenPosition
  ): Vector3 | null => {
    const ray = scene.getPickRay(screenPosition);
    if (!ray) return null;
    const roots = getMapLibreSurfaceRoots(scene.map);
    if (roots.length === 0) return null;
    raycaster.set(ray.origin, ray.direction);
    raycaster.near = 0;
    raycaster.far = ray.length;
    const hit = raycaster.intersectObjects(roots, true)[0];
    return hit ? scene.ecefFromScene(hit.point) : null;
  };

  const pickGround = (
    screenPosition: AnnotationScreenPosition
  ): Vector3 | null => {
    const { map } = scene;
    const canvas = map.getCanvas();
    if (
      screenPosition.x < 0 ||
      screenPosition.y < 0 ||
      screenPosition.x > canvas.clientWidth ||
      screenPosition.y > canvas.clientHeight
    ) {
      return null;
    }
    const lngLat = map.unproject([screenPosition.x, screenPosition.y]);
    if (!Number.isFinite(lngLat.lng) || !Number.isFinite(lngLat.lat)) {
      return null;
    }
    // MapLibre terrain heights are taken as ellipsoidal; a datum shift is a
    // follow-up once the terrain registry publishes its vertical reference.
    const altitude = map.queryTerrainElevation(lngLat) ?? 0;
    return ecefFromGeographicCoordinate({
      longitude: lngLat.lng,
      latitude: lngLat.lat,
      altitude,
    });
  };

  const resolveSurfacePick: MapLibreSurfacePicker["resolveSurfacePick"] = (
    screenPosition,
    options = {}
  ) => {
    const surface = pickSceneSurface(screenPosition);
    const needsGround = options.resolveGlobePosition || surface === null;
    const ground = needsGround ? pickGround(screenPosition) : null;
    return {
      surfacePositionECEF: surface ?? ground,
      globePositionECEF: options.resolveGlobePosition ? ground : null,
    };
  };

  const screenSpaceTangent = (
    center: Vector3,
    positive: Vector3 | null,
    negative: Vector3 | null
  ): Vector3 | null => {
    if (positive && negative) return positive.clone().sub(negative);
    if (positive) return positive.clone().sub(center);
    if (negative) return center.clone().sub(negative);
    return null;
  };

  const sampleSurfaceNormalAt: MapLibreSurfacePicker["sampleSurfaceNormalAt"] =
    (screenPosition, centerECEF) => {
      const sample = (dx: number, dy: number) =>
        resolveSurfacePick(
          { x: screenPosition.x + dx, y: screenPosition.y + dy },
          { resolveGlobePosition: false }
        ).surfacePositionECEF;
      const right = sample(POINTER_NORMAL_SAMPLE_OFFSET_PX, 0);
      const left = sample(-POINTER_NORMAL_SAMPLE_OFFSET_PX, 0);
      const up = sample(0, -POINTER_NORMAL_SAMPLE_OFFSET_PX);
      const down = sample(0, POINTER_NORMAL_SAMPLE_OFFSET_PX);
      const tangentX = screenSpaceTangent(centerECEF, right, left);
      const tangentY = screenSpaceTangent(centerECEF, down, up);
      if (
        !tangentX ||
        !tangentY ||
        tangentX.lengthSq() <= GUIDE_NORMAL_EPSILON_SQUARED ||
        tangentY.lengthSq() <= GUIDE_NORMAL_EPSILON_SQUARED
      ) {
        return null;
      }
      const normal = tangentX.cross(tangentY);
      if (normal.lengthSq() <= GUIDE_NORMAL_EPSILON_SQUARED) {
        return null;
      }
      normal.normalize();
      return normal.dot(getLocalUpDirectionAtAnchor(centerECEF)) < 0
        ? normal.negate()
        : normal;
    };

  const occlusionScratch = new Vector3();
  const isPointOccluded: MapLibreSurfacePicker["isPointOccluded"] = (
    positionECEF,
    toleranceMeters
  ) => {
    const camera = scene.getCameraScenePosition();
    const point = scene.sceneFromEcef(positionECEF, occlusionScratch);
    if (!camera || !point) return false;
    const toPoint = point.clone().sub(camera);
    const distance = toPoint.length();
    if (!(distance > toleranceMeters)) return false;
    const roots = getMapLibreSurfaceRoots(scene.map);
    if (roots.length === 0) return false;
    occlusionRaycaster.set(camera, toPoint.divideScalar(distance));
    occlusionRaycaster.near = 0;
    occlusionRaycaster.far = distance - toleranceMeters;
    return occlusionRaycaster.intersectObjects(roots, true).length > 0;
  };

  return { resolveSurfacePick, sampleSurfaceNormalAt, isPointOccluded };
};
