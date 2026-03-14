/* eslint-disable carma/allowlist-math-library-(dependency-free) */
// Intentionally depends on three.js:
// CARMA adopts three.js vectors/rays as native geometry interaction types.
import { Ray, Vector3 } from "three";

export type PlaneBasis3 = {
  xAxis: Vector3;
  yAxis: Vector3;
};

export const VEC3_NUMERIC_EPSILON = 1e-6;

export const getClosestLineParamToRay = (
  ray: Ray,
  lineOrigin: Vector3,
  lineDirection: Vector3,
  epsilon: number = VEC3_NUMERIC_EPSILON
): number => {
  const rayDirection = ray.direction.clone();
  const normalizedLineDirection = lineDirection.clone();

  if (
    rayDirection.lengthSq() <= epsilon ||
    normalizedLineDirection.lengthSq() <= epsilon
  ) {
    return 0;
  }

  rayDirection.normalize();
  normalizedLineDirection.normalize();

  const originDelta = ray.origin.clone().sub(lineOrigin);

  const a = rayDirection.dot(rayDirection);
  const b = rayDirection.dot(normalizedLineDirection);
  const c = normalizedLineDirection.dot(normalizedLineDirection);
  const d = rayDirection.dot(originDelta);
  const e = normalizedLineDirection.dot(originDelta);
  const denominator = a * c - b * b;

  if (Math.abs(denominator) < epsilon) {
    return e;
  }

  return (a * e - b * d) / denominator;
};

export const intersectRayWithPlane = (
  ray: Ray,
  planeOrigin: Vector3,
  planeNormal: Vector3,
  epsilon: number = VEC3_NUMERIC_EPSILON
): Vector3 | null => {
  const denominator = ray.direction.dot(planeNormal);
  if (Math.abs(denominator) <= epsilon) return null;

  const originToPlane = planeOrigin.clone().sub(ray.origin);
  const t = originToPlane.dot(planeNormal) / denominator;
  if (!Number.isFinite(t)) return null;

  return ray.origin.clone().add(ray.direction.clone().multiplyScalar(t));
};

export const createPlaneBasisFromNormal = (
  normal: Vector3,
  epsilon: number = VEC3_NUMERIC_EPSILON
): PlaneBasis3 => {
  const up =
    normal.lengthSq() > epsilon
      ? normal.clone().normalize()
      : new Vector3(0, 0, 1);
  const reference =
    Math.abs(up.dot(new Vector3(0, 0, 1))) > 0.9
      ? new Vector3(1, 0, 0)
      : new Vector3(0, 0, 1);

  const xAxis = up.clone().cross(reference);
  if (xAxis.lengthSq() > epsilon) {
    xAxis.normalize();
  } else {
    xAxis.set(1, 0, 0);
  }

  const yAxis = xAxis.clone().cross(up);
  if (yAxis.lengthSq() > epsilon) {
    yAxis.normalize();
  } else {
    yAxis.set(0, 1, 0);
  }

  return { xAxis, yAxis };
};
