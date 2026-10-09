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

/** Convex hull of screen points (Andrew's monotone chain), counter-clockwise. */
export const getConvexHull2d = (
  points: readonly ScreenPoint2[]
): ScreenPoint2[] => {
  if (points.length < 3) return [...points];
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: ScreenPoint2, a: ScreenPoint2, b: ScreenPoint2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: ScreenPoint2[] = [];
  for (const point of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: ScreenPoint2[] = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const point = sorted[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
};

export type ConeArrowSilhouette = {
  /** Outline of the cone: hull of the apex and the base rim, relative to the anchor. */
  hull: ScreenPoint2[];
  /** The base rim while the camera looks at the base side, else null. */
  baseRim: ScreenPoint2[] | null;
};

const CONE_ARROW_MAX_OFFSET_WORLD = 1e5;
const CONE_ARROW_MIN_PIXELS_PER_WORLD = 1e-6;

/**
 * A move arrow as a cone in the scene, seen in perspective: the base sits on
 * the axis where the flat arrow's base sat (`offsetPx` from the anchor on
 * screen), and radius and height are the flat arrow's half edge and height
 * at that depth, so the cone matches it when the axis lies across the view
 * and foreshortens, showing its base, as the axis turns toward the camera.
 * A convex body projects onto the hull of its projected apex and base rim.
 * Null when a point does not project (behind the camera) or the axis runs
 * along the view ray; the caller keeps the flat arrow then.
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
  project: (world: Vector3) => ScreenPoint2 | null;
  origin: Vector3;
  /** Unit vector from the anchor toward the arrow tip. */
  direction: Vector3;
  offsetPx: number;
  edgePx: number;
  heightPx: number;
  anchorCanvasPosition: ScreenPoint2;
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
  const baseCenter = origin
    .clone()
    .addScaledVector(direction, baseOffsetWorld);
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

  const toLocal = (world: Vector3): ScreenPoint2 | null => {
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
  const rim: ScreenPoint2[] = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const rimPoint = toLocal(
      sample
        .copy(baseCenter)
        .addScaledVector(side, Math.cos(angle) * radiusWorld)
        .addScaledVector(across, Math.sin(angle) * radiusWorld)
    );
    if (!rimPoint) return null;
    rim.push(rimPoint);
  }

  const baseFacesCamera =
    viewRay.dot(direction) > 0; // the camera sits on the base side
  return {
    hull: getConvexHull2d([apex, ...rim]),
    baseRim: baseFacesCamera ? rim : null,
  };
};

/** SVG path of a closed polygon. */
export const getClosedPolygonPathD = (points: readonly ScreenPoint2[]) =>
  points.length === 0
    ? ""
    : `M ${points
        .map((point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
        .join(" L ")} Z`;
