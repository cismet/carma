import {
  CarmaTransforms,
  Cartesian2,
  Cartesian3,
  Matrix4,
  SceneTransforms,
  Transforms,
  defined,
  type Scene,
} from "@carma/cesium";
import { clamp } from "@carma-commons/math";
import {
  AXIS_NUMERIC_EPSILON,
  getClosestAxisParamToRay,
  type GizmoVec3,
} from "@carma-mapping/gizmo/core";

export type PlaneBasis = {
  xAxis: Cartesian3;
  yAxis: Cartesian3;
};

export type ScreenPoint2 = {
  x: number;
  y: number;
};

export const toGizmoVec3 = (vector: Cartesian3): GizmoVec3 => ({
  x: vector.x,
  y: vector.y,
  z: vector.z,
});

const ENU_FRAME_SCRATCH = new Matrix4();

export const getUpVectorAtPosition = (origin: Cartesian3): Cartesian3 => {
  const eastNorthUpMatrix = Transforms.eastNorthUpToFixedFrame(
    origin,
    undefined,
    ENU_FRAME_SCRATCH
  );
  const upAxis = CarmaTransforms.matrix4ColumnToCartesian3(eastNorthUpMatrix, 2);
  return Cartesian3.normalize(upAxis, upAxis);
};

export const createPlaneBasis = (normal: Cartesian3): PlaneBasis => {
  const up = Cartesian3.normalize(normal, new Cartesian3());
  const reference =
    Math.abs(Cartesian3.dot(up, Cartesian3.UNIT_Z)) > 0.9
      ? Cartesian3.UNIT_X
      : Cartesian3.UNIT_Z;
  const xAxis = Cartesian3.normalize(
    Cartesian3.cross(up, reference, new Cartesian3()),
    new Cartesian3()
  );
  const yAxis = Cartesian3.normalize(
    Cartesian3.cross(xAxis, up, new Cartesian3()),
    new Cartesian3()
  );
  return { xAxis, yAxis };
};

export const rotateVectorByVersor = (
  vector: Cartesian3,
  axis: Cartesian3,
  angleRad: number
): Cartesian3 => {
  const normalizedAxis = Cartesian3.normalize(axis, new Cartesian3());
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  const vCos = Cartesian3.multiplyByScalar(vector, cosA, new Cartesian3());
  const axisCrossV = Cartesian3.cross(normalizedAxis, vector, new Cartesian3());
  const crossTerm = Cartesian3.multiplyByScalar(
    axisCrossV,
    sinA,
    new Cartesian3()
  );
  const axisDotV = Cartesian3.dot(normalizedAxis, vector);
  const axisTerm = Cartesian3.multiplyByScalar(
    normalizedAxis,
    axisDotV * (1 - cosA),
    new Cartesian3()
  );

  return Cartesian3.normalize(
    Cartesian3.add(
      Cartesian3.add(vCos, crossTerm, new Cartesian3()),
      axisTerm,
      new Cartesian3()
    ),
    new Cartesian3()
  );
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
  scene: Scene,
  origin: Cartesian3,
  planeBasis: PlaneBasis,
  anchorCanvasPosition: { x: number; y: number },
  sampleCount: number
): number => {
  let pixelPerWorldMax = 0;
  const xComponent = new Cartesian3();
  const yComponent = new Cartesian3();
  const sampleDirection = new Cartesian3();
  const sampleWorld = new Cartesian3();
  for (let i = 0; i < sampleCount; i += 1) {
    const t = (i / sampleCount) * Math.PI * 2;
    Cartesian3.multiplyByScalar(planeBasis.xAxis, Math.cos(t), xComponent);
    Cartesian3.multiplyByScalar(planeBasis.yAxis, Math.sin(t), yComponent);
    Cartesian3.add(xComponent, yComponent, sampleDirection);
    Cartesian3.add(origin, sampleDirection, sampleWorld);
    const sampleCanvas = SceneTransforms.worldToWindowCoordinates(
      scene,
      sampleWorld
    );
    if (!defined(sampleCanvas)) continue;

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
  scene: Scene,
  origin: Cartesian3,
  planeBasis: PlaneBasis,
  worldRadius: number,
  segments: number,
  anchorCanvasPosition: { x: number; y: number },
  maxAbsCoordinatePx = 8192
): ScreenPoint2[] => {
  const points: ScreenPoint2[] = [];
  const xComponent = new Cartesian3();
  const yComponent = new Cartesian3();
  const offset = new Cartesian3();
  const worldPoint = new Cartesian3();
  for (let i = 0; i < segments; i += 1) {
    const t = (i / segments) * Math.PI * 2;
    const offsetX = Math.cos(t) * worldRadius;
    const offsetY = Math.sin(t) * worldRadius;
    Cartesian3.multiplyByScalar(planeBasis.xAxis, offsetX, xComponent);
    Cartesian3.multiplyByScalar(planeBasis.yAxis, offsetY, yComponent);
    Cartesian3.add(xComponent, yComponent, offset);
    Cartesian3.add(origin, offset, worldPoint);

    const projected = SceneTransforms.worldToWindowCoordinates(
      scene,
      worldPoint
    );
    if (!defined(projected)) continue;

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
  scene: Scene,
  clientX: number,
  clientY: number,
  axisOrigin: Cartesian3,
  axisDirection: Cartesian3
): number | null => {
  if (scene.isDestroyed()) return null;
  const canvasRect = scene.canvas.getBoundingClientRect();
  const windowPosition = new Cartesian2(
    clientX - canvasRect.left,
    clientY - canvasRect.top
  );
  const ray = scene.camera.getPickRay(windowPosition);
  if (!ray) return null;
  return getClosestAxisParamToRay(
    {
      origin: toGizmoVec3(ray.origin),
      direction: toGizmoVec3(ray.direction),
    },
    toGizmoVec3(axisOrigin),
    toGizmoVec3(axisDirection)
  );
};

export const getPlanePointFromClientPosition = (
  scene: Scene,
  clientX: number,
  clientY: number,
  planeOrigin: Cartesian3,
  planeNormal: Cartesian3
): Cartesian3 | null => {
  if (scene.isDestroyed()) return null;
  const canvasRect = scene.canvas.getBoundingClientRect();
  const windowPosition = new Cartesian2(
    clientX - canvasRect.left,
    clientY - canvasRect.top
  );
  const ray = scene.camera.getPickRay(windowPosition);
  if (!ray) return null;

  const denominator = Cartesian3.dot(ray.direction, planeNormal);
  if (Math.abs(denominator) <= AXIS_NUMERIC_EPSILON) return null;

  const originToPlane = Cartesian3.subtract(
    planeOrigin,
    ray.origin,
    new Cartesian3()
  );
  const t = Cartesian3.dot(originToPlane, planeNormal) / denominator;
  if (!Number.isFinite(t)) return null;

  return Cartesian3.add(
    ray.origin,
    Cartesian3.multiplyByScalar(ray.direction, t, new Cartesian3()),
    new Cartesian3()
  );
};

export const getPlaneAngleFromClientPosition = (
  scene: Scene,
  clientX: number,
  clientY: number,
  planeOrigin: Cartesian3,
  planeNormal: Cartesian3,
  planeBasisX: Cartesian3,
  planeBasisY: Cartesian3
): number | null => {
  const planePoint = getPlanePointFromClientPosition(
    scene,
    clientX,
    clientY,
    planeOrigin,
    planeNormal
  );
  if (!planePoint) return null;

  const local = Cartesian3.subtract(planePoint, planeOrigin, new Cartesian3());
  const x = Cartesian3.dot(local, planeBasisX);
  const y = Cartesian3.dot(local, planeBasisY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (Math.hypot(x, y) <= AXIS_NUMERIC_EPSILON) return null;
  return Math.atan2(y, x);
};

export const getGroundPointFromClientPosition = (
  scene: Scene,
  clientX: number,
  clientY: number,
  options?: {
    ignoreTranslucentDepth?: boolean;
  }
): Cartesian3 | null => {
  if (scene.isDestroyed()) return null;
  const canvasRect = scene.canvas.getBoundingClientRect();
  const windowPosition = new Cartesian2(
    clientX - canvasRect.left,
    clientY - canvasRect.top
  );

  if (scene.pickPositionSupported) {
    const previousPickTranslucentDepth = scene.pickTranslucentDepth;
    const shouldIgnoreTranslucentDepth =
      options?.ignoreTranslucentDepth === true &&
      previousPickTranslucentDepth === true;
    if (shouldIgnoreTranslucentDepth) {
      scene.pickTranslucentDepth = false;
    }
    try {
      const pickedPosition = scene.pickPosition(windowPosition);
      if (defined(pickedPosition)) {
        return Cartesian3.clone(pickedPosition);
      }
    } catch {
      // Depth picking may fail during tileset/terrain streaming.
    } finally {
      if (shouldIgnoreTranslucentDepth) {
        scene.pickTranslucentDepth = previousPickTranslucentDepth;
      }
    }
  }

  const pickRay = scene.camera.getPickRay(windowPosition);
  if (!pickRay) return null;

  const groundPoint = scene.globe?.pick(pickRay, scene);
  if (defined(groundPoint)) {
    return Cartesian3.clone(groundPoint);
  }

  return null;
};
