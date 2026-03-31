import type { Plane, Ray, Vector3 } from "three";
import { VECTOR3_NUMERIC_EPSILON } from "./constants";

export const intersectRayWithPlane = (
  ray: Ray,
  plane: Plane,
  epsilon: number = VECTOR3_NUMERIC_EPSILON
): Vector3 | null => {
  const denominator = ray.direction.dot(plane.normal);
  if (Math.abs(denominator) <= epsilon) return null;

  const t = -plane.distanceToPoint(ray.origin) / denominator;
  if (!Number.isFinite(t)) return null;

  return ray.origin.clone().add(ray.direction.clone().multiplyScalar(t));
};
