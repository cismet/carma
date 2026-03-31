import { Matrix3, Ray, Vector3 } from "three";

import { clamp } from "@carma-commons/math";
import type { CssPixelPosition, CssPixels } from "@carma/units/types";

import { AXIS_NUMERIC_EPSILON } from "./constants";
import { transformPointWithMatrix } from "./svgProjection";
export type ViewportRectLike = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ViewportProjectedPoint = CssPixelPosition & {
  depth: number;
};

export const DEFAULT_VIEW_FOV_RAD = (55 * Math.PI) / 180;
export const MIN_VIEW_FOV_RAD = (10 * Math.PI) / 180;
export const MAX_VIEW_FOV_RAD = (150 * Math.PI) / 180;

const extractLinear3x3 = (matrix: readonly number[]): Matrix3 =>
  new Matrix3().set(
    matrix[0] ?? 1,
    matrix[1] ?? 0,
    matrix[2] ?? 0,
    matrix[4] ?? 0,
    matrix[5] ?? 1,
    matrix[6] ?? 0,
    matrix[8] ?? 0,
    matrix[9] ?? 0,
    matrix[10] ?? 1
  );

const invert3x3 = (matrix: Matrix3): Matrix3 | null => {
  const determinant = matrix.determinant();
  if (Math.abs(determinant) <= AXIS_NUMERIC_EPSILON) return null;
  return matrix.clone().invert();
};

const multiplyMat3Vec3 = (matrix: Matrix3, vector: Vector3): Vector3 =>
  vector.clone().applyMatrix3(matrix);

const normalizeOrNull = (vector: Vector3): Vector3 | null => {
  if (vector.lengthSq() <= AXIS_NUMERIC_EPSILON) return null;
  return vector.clone().normalize();
};

const resolveTanHalfFov = (fovRad: number): number | null => {
  const safeFovRad = clamp(fovRad, MIN_VIEW_FOV_RAD, MAX_VIEW_FOV_RAD);
  const tanHalfFov = Math.tan(safeFovRad / 2);
  if (!Number.isFinite(tanHalfFov) || tanHalfFov <= AXIS_NUMERIC_EPSILON) {
    return null;
  }
  return tanHalfFov;
};

export const projectPointToViewport = (
  point: Vector3,
  viewMatrix: number[],
  viewportRect: ViewportRectLike,
  fovRad: number
): ViewportProjectedPoint | null => {
  const safeWidth = Math.max(1, viewportRect.width);
  const safeHeight = Math.max(1, viewportRect.height);
  const tanHalfFov = resolveTanHalfFov(fovRad);
  if (tanHalfFov === null) return null;

  const view = transformPointWithMatrix(point, viewMatrix, {
    matrixOrder: "row-major",
  });
  if (
    !Number.isFinite(view.x) ||
    !Number.isFinite(view.y) ||
    !Number.isFinite(view.z)
  ) {
    return null;
  }
  if (view.z <= 0.05) return null;

  const aspect = safeWidth / safeHeight;
  const xNdc = view.x / (view.z * tanHalfFov * aspect);
  const yNdc = view.y / (view.z * tanHalfFov);
  if (!Number.isFinite(xNdc) || !Number.isFinite(yNdc)) return null;

  return {
    x: ((xNdc + 1) * 0.5 * safeWidth) as CssPixels,
    y: ((1 - yNdc) * 0.5 * safeHeight) as CssPixels,
    depth: view.z,
  };
};

export const rayFromClientPosition = (
  clientX: number,
  clientY: number,
  viewportRect: ViewportRectLike,
  viewMatrix: number[],
  fovRad: number
): Ray | null => {
  const safeWidth = Math.max(1, viewportRect.width);
  const safeHeight = Math.max(1, viewportRect.height);
  const tanHalfFov = resolveTanHalfFov(fovRad);
  if (tanHalfFov === null) return null;

  const linear = extractLinear3x3(viewMatrix);
  const inverted = invert3x3(linear);
  if (!inverted) return null;

  const ndcX = ((clientX - viewportRect.left) / safeWidth) * 2 - 1;
  const ndcY = 1 - ((clientY - viewportRect.top) / safeHeight) * 2;
  const aspect = safeWidth / safeHeight;

  const directionView = normalizeOrNull(
    new Vector3(ndcX * tanHalfFov * aspect, ndcY * tanHalfFov, 1)
  );
  if (!directionView) return null;

  const directionLocal = normalizeOrNull(
    multiplyMat3Vec3(inverted, directionView)
  );
  if (!directionLocal) return null;

  const translationView = new Vector3(
    viewMatrix[3] ?? 0,
    viewMatrix[7] ?? 0,
    viewMatrix[11] ?? 0
  );

  const originLocal = multiplyMat3Vec3(
    inverted,
    translationView.clone().multiplyScalar(-1)
  );

  return new Ray(originLocal, directionLocal);
};
