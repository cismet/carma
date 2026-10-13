import { Plane, Ray, Vector3 } from "three";

import {
  getClosestLineParamToRay,
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
} from "@carma-mapping/annotations/core";

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
