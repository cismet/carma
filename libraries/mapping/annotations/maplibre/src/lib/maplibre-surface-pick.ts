import { clamp, moveVector3Toward } from "@carma-commons/math";
import { getLocalUpDirectionAtAnchor } from "@carma-geo/proj";
import type { Meters } from "@carma-units";
import {
  Matrix3,
  Raycaster,
  Vector3,
  type BufferGeometry,
  type Intersection,
  type Object3D,
} from "three";
import {
  GUIDE_NORMAL_EPSILON_SQUARED,
  type AnnotationScreenPosition,
  type AnnotationSurfacePick,
  type AnnotationSurfacePickOptions,
} from "@carma-mapping/annotations/core";

import type { MapLibreAnnotationScene } from "./maplibre-annotation-scene.types";
import { getMapLibreSurfaceRuntimes } from "./maplibre-surface-availability";
import {
  intersectMapLibreTerrain,
  resolveMapLibreTerrainHeights,
  resolveMapLibreTerrainNormal,
  type MapLibreTerrainHeights,
} from "./maplibre-terrain-pick";

/**
 * Surface picking against the shared Three.js scene: a ray through the
 * pointer, the first hit on a visible runtime that provides terrain or
 * holds tiles (meshes, tilesets, Three terrain). A terrain that answers
 * heights is marched against them, everything else raycast. MapLibre's own
 * terrain is never measured on: without a hit there is no position.
 */

/** Distance of the four surface samples a normal is derived from when the hit carries none. */
const POINTER_NORMAL_SAMPLE_OFFSET_PX = 2;

/**
 * A picked point moves toward the camera by a small share of its distance, so
 * the measurement drawn from it wins the depth test against the clicked
 * surface. MapLibre's projection matrix carries no usable near and far planes
 * for the shared scene: the step is the relative resolution of a 24-bit depth
 * buffer at street-scale distances, kept between 0.5 mm and 9 mm so the move
 * never changes a measured value.
 */
const PICK_LIFT = Object.freeze({
  /** Lift per metre of distance to the camera: 0.1 mm at 1 m, 3.5 mm at 35 m. */
  relativeLift: 1e-4,
  minMeters: 0.0005 as Meters,
  maxMeters: 0.009 as Meters,
});

export const resolvePickLiftMeters = (distanceMeters: number): Meters => {
  const { relativeLift, minMeters, maxMeters } = PICK_LIFT;
  return distanceMeters > 0
    ? (clamp(distanceMeters * relativeLift, minMeters, maxMeters) as Meters)
    : minMeters;
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

/** A hit in scene coordinates; a terrain hit carries no intersection. */
type SceneSurfaceHit = {
  distance: number;
  point: Vector3;
  intersection: Intersection | null;
};

export const createMapLibreSurfacePicker = (
  scene: MapLibreAnnotationScene
): MapLibreSurfacePicker => {
  const raycaster = createSurfaceRaycaster();
  const occlusionRaycaster = createSurfaceRaycaster();

  // The drawn surface objects with their world bounding spheres, gathered
  // once per frame: a pick tests the spheres, then raycasts the objects
  // nearest first and stops once no further sphere can hold a closer hit
  // (tiles carry no BVH, so a plain raycast walks every triangle of every tile).
  // Terrains answering heights are marched instead, see `maplibre-terrain-pick`.
  let candidatesFrameKey = -1;
  let candidates: SurfaceCandidate[] = [];
  let terrainHeights: MapLibreTerrainHeights | null = null;
  const resolveCandidates = () => {
    const frameKey = scene.getFrameKey();
    if (frameKey === candidatesFrameKey) return candidates;
    candidatesFrameKey = frameKey;
    candidates = [];
    const runtimes = getMapLibreSurfaceRuntimes(scene.map);
    terrainHeights = resolveMapLibreTerrainHeights(runtimes);
    for (const { root, getDrawnElevation } of runtimes) {
      if (getDrawnElevation) continue;
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

  const eyeScratch = new Vector3();
  /** The nearest hit on terrain or tiles within `far`. */
  const castNearest = (
    caster: Raycaster,
    origin: Vector3,
    direction: Vector3,
    far: number,
    anyHit: boolean
  ): SceneSurfaceHit | null => {
    resolveCandidates();
    const eye = scene.getCameraScenePosition(eyeScratch);
    const terrainDistance = terrainHeights
      ? intersectMapLibreTerrain(
          scene,
          terrainHeights,
          origin,
          direction,
          far,
          eye ? eye.distanceTo(origin) : 0
        )
      : null;
    const terrainHit = (distance: number): SceneSurfaceHit => ({
      distance,
      point: origin.clone().addScaledVector(direction, distance),
      intersection: null,
    });
    if (terrainDistance !== null && anyHit) return terrainHit(terrainDistance);
    const intersection = raycastNearest(
      caster,
      origin,
      direction,
      terrainDistance ?? far,
      anyHit
    );
    if (intersection) {
      return {
        distance: intersection.distance,
        point: intersection.point,
        intersection,
      };
    }
    return terrainDistance === null ? null : terrainHit(terrainDistance);
  };

  // A pointer move asks for the surface, its normal and the query disc at
  // one position within one frame: answer repeats from the last pick.
  let lastPick: {
    x: number;
    y: number;
    frameKey: number;
    hit: SceneSurfaceHit | null;
  } | null = null;
  const pickSceneHit = (
    screenPosition: AnnotationScreenPosition
  ): SceneSurfaceHit | null => {
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
      ? castNearest(raycaster, ray.origin, ray.direction, ray.length, false)
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

  const normalMatrix = new Matrix3();
  const faceNormalScene = new Vector3();
  const faceNormalTip = new Vector3();
  /** The hit triangle's normal in ECEF. */
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

  /** The terrain's normal at a terrain hit, from its heights. */
  const resolveTerrainHitNormal = (scenePosition: Vector3) => {
    const positionECEF = scene.ecefFromScene(scenePosition);
    return terrainHeights && positionECEF
      ? resolveMapLibreTerrainNormal(
          scene,
          terrainHeights,
          scenePosition,
          positionECEF
        )
      : null;
  };

  const liftCameraScene = new Vector3();
  /** The picked point, moved toward the camera by `resolvePickLiftMeters`. */
  const liftTowardCamera = (positionECEF: Vector3 | null) => {
    if (!positionECEF) return null;
    const cameraScene = scene.getCameraScenePosition(liftCameraScene);
    const cameraECEF = cameraScene ? scene.ecefFromScene(cameraScene) : null;
    return cameraECEF
      ? moveVector3Toward(
          positionECEF,
          cameraECEF,
          resolvePickLiftMeters(positionECEF.distanceTo(cameraECEF))
        )
      : positionECEF;
  };

  const resolveSurfacePick: MapLibreSurfacePicker["resolveSurfacePick"] = (
    screenPosition
  ) => ({
    surfacePositionECEF: liftTowardCamera(pickSceneSurface(screenPosition)),
    globePositionECEF: null,
  });

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

  const orientUpward = (normal: Vector3, centerECEF: Vector3) =>
    normal.dot(getLocalUpDirectionAtAnchor(centerECEF)) < 0
      ? normal.negate()
      : normal;

  const sampleSurfaceNormalAt: MapLibreSurfacePicker["sampleSurfaceNormalAt"] =
    (screenPosition, centerECEF) => {
      // The hit triangle carries the normal; four picks around the pointer
      // stand in for hits without one.
      const hit = pickSceneHit(screenPosition);
      const faceNormal = !hit
        ? null
        : hit.intersection
        ? resolveHitNormalEcef(hit.intersection)
        : resolveTerrainHitNormal(hit.point);
      if (faceNormal) return orientUpward(faceNormal, centerECEF);
      const sample = (dx: number, dy: number) =>
        resolveSurfacePick({
          x: screenPosition.x + dx,
          y: screenPosition.y + dy,
        }).surfacePositionECEF;
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
      return normal.lengthSq() <= GUIDE_NORMAL_EPSILON_SQUARED
        ? null
        : orientUpward(normal.normalize(), centerECEF);
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
      castNearest(
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
