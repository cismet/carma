import { Plane, Ray, Vector3 } from "three";

import {
  clamp,
  getClosestLineParamToRay,
  getConvexHull2d,
  intersectRayWithPlane,
  type createPlaneBasisFromNormal,
  type Point2,
} from "@carma-commons/math";
import { AXIS_NUMERIC_EPSILON } from "@carma-mapping/gizmo/core";
import { TWO_PI } from "@carma-units";

import type {
  AnnotationEngine,
  AnnotationScreenPosition,
  AnnotationSurfacePick,
} from "../annotation-engine.types";

type PlaneBasis = ReturnType<typeof createPlaneBasisFromNormal>;

const PLANE_SCRATCH = new Plane();

export const getCanvasPositionFromClientPosition = (
  engine: AnnotationEngine,
  clientX: number,
  clientY: number
): AnnotationScreenPosition => {
  const canvasRect = engine.canvas.getBoundingClientRect();
  return { x: clientX - canvasRect.left, y: clientY - canvasRect.top };
};

const getPickRayFromClientPosition = (
  engine: AnnotationEngine,
  clientX: number,
  clientY: number
): Ray | null => {
  if (engine.isDestroyed()) return null;
  const ray = engine.getPickRay(
    getCanvasPositionFromClientPosition(engine, clientX, clientY)
  );
  return ray ? new Ray(ray.origin, ray.direction) : null;
};

export const getAxisSampleWorldStep = (
  unitSamplePixels: number,
  targetPixels: number,
  minWorldStep: number,
  maxWorldStep: number
): number =>
  !Number.isFinite(unitSamplePixels) || unitSamplePixels <= AXIS_NUMERIC_EPSILON
    ? 0
    : clamp(targetPixels / unitSamplePixels, minWorldStep, maxWorldStep);

export const getPlanePixelsPerWorldMax = (
  engine: AnnotationEngine,
  origin: Vector3,
  planeBasis: PlaneBasis,
  anchorCanvasPosition: Point2,
  sampleCount: number
): number => {
  let pixelPerWorldMax = 0;
  const sampleWorld = new Vector3();
  for (let i = 0; i < sampleCount; i += 1) {
    const t = (i / sampleCount) * TWO_PI;
    sampleWorld
      .copy(origin)
      .addScaledVector(planeBasis.xAxis, Math.cos(t))
      .addScaledVector(planeBasis.yAxis, Math.sin(t));
    const sampleCanvas = engine.worldToScreen(sampleWorld);
    if (!sampleCanvas) continue;

    const d = Math.hypot(
      sampleCanvas.x - anchorCanvasPosition.x,
      sampleCanvas.y - anchorCanvasPosition.y
    );
    if (Number.isFinite(d) && d > pixelPerWorldMax) {
      pixelPerWorldMax = d;
    }
  }
  return pixelPerWorldMax;
};

export const projectPlaneOutlinePoints = (
  engine: AnnotationEngine,
  origin: Vector3,
  planeBasis: PlaneBasis,
  worldRadius: number,
  segments: number,
  anchorCanvasPosition: Point2,
  maxAbsCoordinatePx = 8192
): Point2[] => {
  const points: Point2[] = [];
  const worldPoint = new Vector3();
  for (let i = 0; i < segments; i += 1) {
    const t = (i / segments) * TWO_PI;
    worldPoint
      .copy(origin)
      .addScaledVector(planeBasis.xAxis, Math.cos(t) * worldRadius)
      .addScaledVector(planeBasis.yAxis, Math.sin(t) * worldRadius);

    const projected = engine.worldToScreen(worldPoint);
    if (!projected) continue;

    const localX = projected.x - anchorCanvasPosition.x;
    const localY = projected.y - anchorCanvasPosition.y;
    if (
      !Number.isFinite(localX) ||
      !Number.isFinite(localY) ||
      Math.abs(localX) > maxAbsCoordinatePx ||
      Math.abs(localY) > maxAbsCoordinatePx
    ) {
      continue;
    }

    points.push({ x: localX, y: localY });
  }
  return points;
};

export const getAxisParamFromClientPosition = (
  engine: AnnotationEngine,
  clientX: number,
  clientY: number,
  axisOrigin: Vector3,
  axisDirection: Vector3
): number | null => {
  const ray = getPickRayFromClientPosition(engine, clientX, clientY);
  return ray ? getClosestLineParamToRay(ray, axisOrigin, axisDirection) : null;
};

export const getPlanePointFromClientPosition = (
  engine: AnnotationEngine,
  clientX: number,
  clientY: number,
  planeOrigin: Vector3,
  planeNormal: Vector3
): Vector3 | null => {
  const ray = getPickRayFromClientPosition(engine, clientX, clientY);
  return ray
    ? intersectRayWithPlane(
        ray,
        PLANE_SCRATCH.setFromNormalAndCoplanarPoint(planeNormal, planeOrigin),
        AXIS_NUMERIC_EPSILON
      )
    : null;
};

export const getPlaneAngleFromClientPosition = (
  engine: AnnotationEngine,
  clientX: number,
  clientY: number,
  planeOrigin: Vector3,
  planeNormal: Vector3,
  planeBasisX: Vector3,
  planeBasisY: Vector3
): number | null => {
  const planePoint = getPlanePointFromClientPosition(
    engine,
    clientX,
    clientY,
    planeOrigin,
    planeNormal
  );
  if (!planePoint) return null;

  const local = new Vector3().subVectors(planePoint, planeOrigin);
  const x = local.dot(planeBasisX);
  const y = local.dot(planeBasisY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (Math.hypot(x, y) <= AXIS_NUMERIC_EPSILON) return null;
  return Math.atan2(y, x);
};

/**
 * Surface (else ground) under the pointer. The adapter keeps its helper
 * primitives out of the pick and, on request, the registered drag-sample
 * occluders (the dragged node's own lines).
 */
export const getGroundPointFromClientPosition = (
  engine: AnnotationEngine,
  clientX: number,
  clientY: number,
  options?: { includeDragSampleExclusions?: boolean }
): Vector3 | null => {
  if (engine.isDestroyed()) return null;
  const screenPosition = getCanvasPositionFromClientPosition(
    engine,
    clientX,
    clientY
  );

  let surfacePick: AnnotationSurfacePick | null = null;
  try {
    surfacePick = engine.resolveSurfacePick(screenPosition, {
      resolveGlobePosition: true,
      excludeDragSampleOccluders: options?.includeDragSampleExclusions === true,
    });
  } catch {
    // Surface picking may fail during tileset/terrain streaming.
  }
  return (
    surfacePick?.surfacePositionECEF?.clone() ??
    surfacePick?.globePositionECEF?.clone() ??
    null
  );
};

export type ConeArrowSilhouette = {
  /** Outline of the cone: hull of the apex and the base rim, relative to the anchor. */
  hull: Point2[];
  /** The base rim while the camera looks at the base side, else null. */
  baseRim: Point2[] | null;
  /** The cone tip, relative to the anchor. */
  apex: Point2;
};

const CONE_ARROW_MAX_OFFSET_WORLD = 1e5;
const CONE_ARROW_MIN_PIXELS_PER_WORLD = 1e-6;

/**
 * A move arrow as a cone seen in perspective: its base sits `offsetPx` from
 * the anchor on screen, radius and height match the flat arrow at that depth,
 * so it equals the flat arrow across the view and foreshortens, showing its
 * base, as the axis turns toward the camera. Null when a point does not
 * project or the axis runs along the view ray; the caller keeps the flat arrow.
 */
export const projectConeArrowSilhouette = ({
  project,
  origin,
  direction,
  offsetPx,
  edgePx,
  heightPx,
  anchorCanvasPosition,
  cameraPosition,
  segments = 24,
}: {
  project: (world: Vector3) => Point2 | null;
  origin: Vector3;
  /** Unit vector from the anchor toward the arrow tip. */
  direction: Vector3;
  offsetPx: number;
  edgePx: number;
  heightPx: number;
  anchorCanvasPosition: Point2;
  cameraPosition: Vector3;
  segments?: number;
}): ConeArrowSilhouette | null => {
  const screenDistanceTo = (world: Vector3) => {
    const projected = project(world);
    return projected
      ? Math.hypot(
          projected.x - anchorCanvasPosition.x,
          projected.y - anchorCanvasPosition.y
        )
      : null;
  };

  // Where on the axis the base lands offsetPx away on screen: a first guess
  // from a one-metre sample, refined twice for the perspective.
  const sample = new Vector3();
  const unitPixels = screenDistanceTo(
    sample.copy(origin).addScaledVector(direction, 1)
  );
  if (unitPixels === null || unitPixels < CONE_ARROW_MIN_PIXELS_PER_WORLD) {
    return null;
  }
  let baseOffsetWorld = offsetPx / unitPixels;
  for (let i = 0; i < 2; i += 1) {
    const pixels = screenDistanceTo(
      sample.copy(origin).addScaledVector(direction, baseOffsetWorld)
    );
    if (pixels === null || pixels < CONE_ARROW_MIN_PIXELS_PER_WORLD) {
      return null;
    }
    baseOffsetWorld *= offsetPx / pixels;
  }
  if (
    !Number.isFinite(baseOffsetWorld) ||
    baseOffsetWorld > CONE_ARROW_MAX_OFFSET_WORLD
  ) {
    return null;
  }
  const baseCenter = origin.clone().addScaledVector(direction, baseOffsetWorld);
  const baseCenterScreen = project(baseCenter);
  if (!baseCenterScreen) return null;

  // Pixels per world unit across the view at the base, from a short step
  // perpendicular to both the axis and the view ray.
  const viewRay = baseCenter.clone().sub(cameraPosition);
  const side = new Vector3().crossVectors(direction, viewRay);
  if (side.lengthSq() < 1e-12) {
    side.set(1, 0, 0).cross(direction);
    if (side.lengthSq() < 1e-12) side.set(0, 1, 0).cross(direction);
  }
  side.normalize();
  const sideStep = Math.max(baseOffsetWorld * 0.1, 1e-6);
  const sideScreen = project(
    sample.copy(baseCenter).addScaledVector(side, sideStep)
  );
  if (!sideScreen) return null;
  const sidePixelsPerWorld =
    Math.hypot(
      sideScreen.x - baseCenterScreen.x,
      sideScreen.y - baseCenterScreen.y
    ) / sideStep;
  if (sidePixelsPerWorld < CONE_ARROW_MIN_PIXELS_PER_WORLD) return null;

  const radiusWorld = edgePx / 2 / sidePixelsPerWorld;
  const heightWorld = heightPx / sidePixelsPerWorld;
  const across = new Vector3().crossVectors(direction, side).normalize();

  const toLocal = (world: Vector3): Point2 | null => {
    const projected = project(world);
    if (!projected) return null;
    const x = projected.x - anchorCanvasPosition.x;
    const y = projected.y - anchorCanvasPosition.y;
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  };

  const apex = toLocal(
    sample.copy(baseCenter).addScaledVector(direction, heightWorld)
  );
  if (!apex) return null;
  const rim: Point2[] = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * TWO_PI;
    const rimPoint = toLocal(
      sample
        .copy(baseCenter)
        .addScaledVector(side, Math.cos(angle) * radiusWorld)
        .addScaledVector(across, Math.sin(angle) * radiusWorld)
    );
    if (!rimPoint) return null;
    rim.push(rimPoint);
  }

  const baseFacesCamera = viewRay.dot(direction) > 0;
  return {
    hull: getConvexHull2d([apex, ...rim]),
    baseRim: baseFacesCamera ? rim : null,
    apex,
  };
};
