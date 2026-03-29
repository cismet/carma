import type { Ray, Vector3 } from "three";
import { VECTOR3_NUMERIC_EPSILON } from "./constants";

export const getClosestLineParamToRay = (
  ray: Ray,
  lineOrigin: Vector3,
  lineDirection: Vector3,
  epsilon: number = VECTOR3_NUMERIC_EPSILON
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
