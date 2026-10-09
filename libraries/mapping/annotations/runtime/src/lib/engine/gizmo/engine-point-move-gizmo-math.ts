import { Ray, Vector3 } from "three";

import { clamp, getClosestLineParamToRay } from "@carma-commons/math";
import { AXIS_NUMERIC_EPSILON } from "@carma-mapping/gizmo/core";

import type {
  AnnotationEngine,
  AnnotationScreenPosition,
  AnnotationSurfacePick,
} from "../annotation-engine.types";

/**
 * Port of the Cesium `cesiumPointMoveGizmoMath` helpers onto the
 * `AnnotationEngine` contract: `Cartesian3` → `THREE.Vector3`, pick rays and
 * projections come from the engine, surface sampling goes through
 * `engine.resolveSurfacePick`.
 */

export type PlaneBasis = {
  xAxis: Vector3;
  yAxis: Vector3;
};

export type ScreenPoint2 = {
  x: number;
  y: number;
};

const getCanvasPositionFromClientPosition = (
  engine: AnnotationEngine,
  clientX: number,
  clientY: number
): AnnotationScreenPosition => {
  const canvasRect = engine.canvas.getBoundingClientRect();
  return {
    x: clientX - canvasRect.left,
    y: clientY - canvasRect.top,
  };
};

export const rotateVectorByVersor = (
  vector: Vector3,
  axis: Vector3,
  angleRad: number
): Vector3 => {
  const normalizedAxis = axis.clone().normalize();
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  const vCos = vector.clone().multiplyScalar(cosA);
  const axisCrossV = new Vector3().crossVectors(normalizedAxis, vector);
  const crossTerm = axisCrossV.multiplyScalar(sinA);
  const axisDotV = normalizedAxis.dot(vector);
  const axisTerm = normalizedAxis.clone().multiplyScalar(axisDotV * (1 - cosA));

  return vCos.add(crossTerm).add(axisTerm).normalize();
};

export const getAxisSampleWorldStep = (
  unitSamplePixels: number,
  targetPixels: number,
  minWorldStep: number,
  maxWorldStep: number
): number => {
  if (
    !Number.isFinite(unitSamplePixels) ||
    unitSamplePixels <= AXIS_NUMERIC_EPSILON
  ) {
    return 0;
  }

  return clamp(targetPixels / unitSamplePixels, minWorldStep, maxWorldStep);
};

export const getPlanePixelsPerWorldMax = (
  engine: AnnotationEngine,
  origin: Vector3,
  planeBasis: PlaneBasis,
  anchorCanvasPosition: { x: number; y: number },
  sampleCount: number
): number => {
  let pixelPerWorldMax = 0;
  const sampleWorld = new Vector3();
  for (let i = 0; i < sampleCount; i += 1) {
    const t = (i / sampleCount) * Math.PI * 2;
    sampleWorld
      .copy(origin)
      .addScaledVector(planeBasis.xAxis, Math.cos(t))
      .addScaledVector(planeBasis.yAxis, Math.sin(t));
    const sampleCanvas = engine.worldToScreen(sampleWorld);
    if (!sampleCanvas) continue;

    const dx = sampleCanvas.x - anchorCanvasPosition.x;
    const dy = sampleCanvas.y - anchorCanvasPosition.y;
    const d = Math.hypot(dx, dy);
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
  anchorCanvasPosition: { x: number; y: number },
  maxAbsCoordinatePx = 8192
): ScreenPoint2[] => {
  const points: ScreenPoint2[] = [];
  const worldPoint = new Vector3();
  for (let i = 0; i < segments; i += 1) {
    const t = (i / segments) * Math.PI * 2;
    const offsetX = Math.cos(t) * worldRadius;
    const offsetY = Math.sin(t) * worldRadius;
    worldPoint
      .copy(origin)
      .addScaledVector(planeBasis.xAxis, offsetX)
      .addScaledVector(planeBasis.yAxis, offsetY);

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
  if (engine.isDestroyed()) return null;
  const ray = engine.getPickRay(
    getCanvasPositionFromClientPosition(engine, clientX, clientY)
  );
  if (!ray) return null;

  return getClosestLineParamToRay(
    new Ray(ray.origin, ray.direction),
    axisOrigin,
    axisDirection
  );
};

export const getPlanePointFromClientPosition = (
  engine: AnnotationEngine,
  clientX: number,
  clientY: number,
  planeOrigin: Vector3,
  planeNormal: Vector3
): Vector3 | null => {
  if (engine.isDestroyed()) return null;
  const ray = engine.getPickRay(
    getCanvasPositionFromClientPosition(engine, clientX, clientY)
  );
  if (!ray) return null;

  const denominator = ray.direction.dot(planeNormal);
  if (Math.abs(denominator) <= AXIS_NUMERIC_EPSILON) return null;

  const originToPlane = new Vector3().subVectors(planeOrigin, ray.origin);
  const t = originToPlane.dot(planeNormal) / denominator;
  if (!Number.isFinite(t)) return null;

  return ray.origin.clone().addScaledVector(ray.direction, t);
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

export const getGroundPointFromClientPosition = (
  engine: AnnotationEngine,
  clientX: number,
  clientY: number,
  options?: {
    includeDragSampleExclusions?: boolean;
  }
): Vector3 | null => {
  if (engine.isDestroyed()) return null;
  const screenPosition = getCanvasPositionFromClientPosition(
    engine,
    clientX,
    clientY
  );

  // The adapter keeps its own helper primitives (gizmo visuals) out of the
  // surface pick and, on request, also the geometry registered as drag-sample
  // occluders (the dragged node's own lines), so every other geometry stays
  // snappable.
  let surfacePick: AnnotationSurfacePick | null = null;
  try {
    surfacePick = engine.resolveSurfacePick(screenPosition, {
      resolveGlobePosition: true,
      excludeDragSampleOccluders: options?.includeDragSampleExclusions === true,
    });
  } catch {
    // Surface picking may fail during tileset/terrain streaming.
  }
  if (surfacePick?.surfacePositionECEF) {
    return surfacePick.surfacePositionECEF.clone();
  }

  // Fallback: ground-only intersection (also excludes every primitive).
  if (surfacePick?.globePositionECEF) {
    return surfacePick.globePositionECEF.clone();
  }

  return null;
};
