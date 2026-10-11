import type { Map as MaplibreMap } from "maplibre-gl";
import {
  Matrix3,
  Raycaster,
  Vector3,
  type BufferGeometry,
  type Intersection,
  type Object3D,
} from "three";
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
import { resolvePickLiftMeters } from "./maplibre-pick-lift";

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

type SurfaceCandidate = {
  object: Object3D;
  center: Vector3;
  radiusSquared: number;
};

export const createMapLibreSurfacePicker = (
  scene: MapLibreAnnotationScene
): MapLibreSurfacePicker => {
  const raycaster = createSurfaceRaycaster();
  const occlusionRaycaster = createSurfaceRaycaster();

  // The drawn surface objects with their world bounding spheres, gathered
  // once per frame: a pick only tests spheres, then raycasts the objects
  // nearest first and stops once no further sphere can hold a closer hit.
  // Tiles carry no BVH, so a plain raycast walks every triangle of every
  // tile along the ray, the far ones included.
  let candidatesFrameKey = -1;
  let candidates: SurfaceCandidate[] = [];
  const resolveCandidates = () => {
    const frameKey = scene.getFrameKey();
    if (frameKey === candidatesFrameKey) return candidates;
    candidatesFrameKey = frameKey;
    candidates = [];
    for (const root of getMapLibreSurfaceRoots(scene.map)) {
      root.traverseVisible((object) => {
        const geometry = (object as Object3D & { geometry?: BufferGeometry })
          .geometry;
        if (!geometry) return;
        if (!geometry.boundingSphere) geometry.computeBoundingSphere();
        const sphere = geometry.boundingSphere;
        if (!sphere) return;
        const radius = sphere.radius * object.matrixWorld.getMaxScaleOnAxis();
        candidates.push({
          object,
          center: sphere.center.clone().applyMatrix4(object.matrixWorld),
          radiusSquared: radius * radius,
        });
      });
    }
    return candidates;
  };

  const toCenter = new Vector3();
  /** Where the ray enters the sphere, or null when it misses it within `far`. */
  const sphereEntryDistance = (
    origin: Vector3,
    direction: Vector3,
    candidate: SurfaceCandidate,
    far: number
  ) => {
    toCenter.subVectors(candidate.center, origin);
    const along = toCenter.dot(direction);
    const offAxisSquared = toCenter.lengthSq() - along * along;
    if (offAxisSquared > candidate.radiusSquared) return null;
    const halfChord = Math.sqrt(candidate.radiusSquared - offAxisSquared);
    if (along + halfChord < 0) return null;
    const entry = Math.max(0, along - halfChord);
    return entry > far ? null : entry;
  };

  const raycastNearest = (
    caster: Raycaster,
    origin: Vector3,
    direction: Vector3,
    far: number,
    anyHit: boolean
  ): Intersection | null => {
    caster.set(origin, direction);
    caster.near = 0;
    caster.far = far;
    const hits: { entry: number; object: Object3D }[] = [];
    for (const candidate of resolveCandidates()) {
      const entry = sphereEntryDistance(origin, direction, candidate, far);
      if (entry !== null) hits.push({ entry, object: candidate.object });
    }
    hits.sort((left, right) => left.entry - right.entry);
    let nearest: Intersection | null = null;
    for (const { entry, object } of hits) {
      if (nearest && entry > nearest.distance) break;
      const hit = caster.intersectObject(object, false)[0];
      if (hit && (!nearest || hit.distance < nearest.distance)) {
        nearest = hit;
        if (anyHit) break;
      }
    }
    return nearest;
  };

  // A pointer move asks for the surface, its normal and the query disc at
  // one position within one frame: answer repeats from the last pick.
  let lastPick: {
    x: number;
    y: number;
    frameKey: number;
    hit: Intersection | null;
  } | null = null;
  const pickSceneHit = (
    screenPosition: AnnotationScreenPosition
  ): Intersection | null => {
    const frameKey = scene.getFrameKey();
    if (
      lastPick &&
      lastPick.frameKey === frameKey &&
      lastPick.x === screenPosition.x &&
      lastPick.y === screenPosition.y
    ) {
      return lastPick.hit;
    }
    const ray = scene.getPickRay(screenPosition);
    const hit = ray
      ? raycastNearest(raycaster, ray.origin, ray.direction, ray.length, false)
      : null;
    lastPick = { x: screenPosition.x, y: screenPosition.y, frameKey, hit };
    return hit;
  };

  const pickSceneSurface = (
    screenPosition: AnnotationScreenPosition
  ): Vector3 | null => {
    const hit = pickSceneHit(screenPosition);
    return hit ? scene.ecefFromScene(hit.point) : null;
  };

  /** The hit triangle's normal in ECEF, facing the camera side. */
  const normalMatrix = new Matrix3();
  const faceNormalScene = new Vector3();
  const faceNormalTip = new Vector3();
  const resolveHitNormalEcef = (hit: Intersection): Vector3 | null => {
    if (!hit.face) return null;
    normalMatrix.getNormalMatrix(hit.object.matrixWorld);
    faceNormalScene
      .copy(hit.face.normal)
      .applyMatrix3(normalMatrix)
      .normalize();
    const base = scene.ecefFromScene(hit.point);
    const tip = scene.ecefFromScene(
      faceNormalTip.copy(hit.point).add(faceNormalScene)
    );
    if (!base || !tip) return null;
    const normal = tip.sub(base);
    return normal.lengthSq() > GUIDE_NORMAL_EPSILON_SQUARED
      ? normal.normalize()
      : null;
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

  const liftCameraScene = new Vector3();
  /** The picked point, moved toward the camera, see maplibre-pick-lift. */
  const liftTowardCamera = (positionECEF: Vector3 | null) => {
    if (!positionECEF) return null;
    const cameraScene = scene.getCameraScenePosition(liftCameraScene);
    const cameraECEF = cameraScene ? scene.ecefFromScene(cameraScene) : null;
    if (!cameraECEF) return positionECEF;
    const toCamera = cameraECEF.sub(positionECEF);
    const distanceMeters = toCamera.length();
    if (!(distanceMeters > 0)) return positionECEF;
    return positionECEF
      .clone()
      .addScaledVector(
        toCamera,
        resolvePickLiftMeters(distanceMeters) / distanceMeters
      );
  };

  const resolveSurfacePick: MapLibreSurfacePicker["resolveSurfacePick"] = (
    screenPosition,
    options = {}
  ) => {
    const surface = pickSceneSurface(screenPosition);
    const needsGround = options.resolveGlobePosition || surface === null;
    const ground = needsGround ? pickGround(screenPosition) : null;
    return {
      surfacePositionECEF: liftTowardCamera(surface ?? ground),
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
      // On a scene surface the hit triangle carries the normal; four extra
      // picks around the pointer (the Cesium way) are only needed on the
      // MapLibre terrain fallback, which has no triangles to read.
      const hit = pickSceneHit(screenPosition);
      const faceNormal = hit ? resolveHitNormalEcef(hit) : null;
      if (faceNormal) {
        return faceNormal.dot(getLocalUpDirectionAtAnchor(centerECEF)) < 0
          ? faceNormal.negate()
          : faceNormal;
      }
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
    return (
      raycastNearest(
        occlusionRaycaster,
        camera,
        toPoint.divideScalar(distance),
        distance - toleranceMeters,
        true
      ) !== null
    );
  };

  return { resolveSurfacePick, sampleSurfaceNormalAt, isPointOccluded };
};
