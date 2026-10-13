import type { Vector3 } from "three";

import { clamp } from "../numeric";
import { VECTOR3_NUMERIC_EPSILON } from "./constants";

const EPSILON_SQUARED = VECTOR3_NUMERIC_EPSILON * VECTOR3_NUMERIC_EPSILON;

export const projectVector3OntoPlane = (
  point: Vector3,
  planeOrigin: Vector3,
  planeNormal: Vector3,
  out: Vector3 = point.clone()
): Vector3 => {
  const normalLengthSquared = planeNormal.lengthSq();
  if (normalLengthSquared <= EPSILON_SQUARED) return out.copy(point);
  const offset = point.clone().sub(planeOrigin).dot(planeNormal);
  return out
    .copy(point)
    .addScaledVector(planeNormal, -offset / normalLengthSquared);
};

export const getSignedVector3DistanceToPlane = (
  point: Vector3,
  planeOrigin: Vector3,
  planeNormal: Vector3
): number => {
  const normalLength = planeNormal.length();
  return normalLength <= VECTOR3_NUMERIC_EPSILON
    ? 0
    : point.clone().sub(planeOrigin).dot(planeNormal) / normalLength;
};

export const getNormalizedTriangleNormal = (
  a: Vector3,
  b: Vector3,
  c: Vector3,
  out: Vector3 = a.clone()
): Vector3 | null => {
  out.crossVectors(b.clone().sub(a), c.clone().sub(a));
  return out.lengthSq() <= EPSILON_SQUARED ? null : out.normalize();
};

/**
 * Unit normal of a closed polygon by Newell's method, which needs no three
 * corners that span a plane; the triangle of the first three corners when the
 * sum cancels out, null when the corners span no plane.
 */
export const getNormalizedPolygonNormal = (
  positions: readonly Vector3[]
): Vector3 | null => {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let index = 0; index < positions.length; index += 1) {
    const current = positions[index]!;
    const next = positions[(index + 1) % positions.length]!;
    x += (current.y - next.y) * (current.z + next.z);
    y += (current.z - next.z) * (current.x + next.x);
    z += (current.x - next.x) * (current.y + next.y);
  }
  if (x * x + y * y + z * z > 0) {
    return positions[0]!.clone().set(x, y, z).normalize();
  }
  return positions.length >= 3
    ? getNormalizedTriangleNormal(positions[0]!, positions[1]!, positions[2]!)
    : null;
};

/**
 * The arc of that radius around the corner, from the first leg toward the
 * second; null when the legs do not span a plane.
 */
export const getArcPointsInSpannedPlane = (
  corner: Vector3,
  firstLegEnd: Vector3,
  secondLegEnd: Vector3,
  radius: number,
  segmentCount: number
): Vector3[] | null => {
  if (!Number.isFinite(radius) || radius <= 0) return null;
  const first = firstLegEnd.clone().sub(corner);
  const second = secondLegEnd.clone().sub(corner);
  const firstLength = first.length();
  const secondLength = second.length();
  if (firstLength <= VECTOR3_NUMERIC_EPSILON) return null;
  if (secondLength <= VECTOR3_NUMERIC_EPSILON) return null;
  const firstDirection = first.normalize();
  const secondDirection = second.normalize();
  const dot = clamp(firstDirection.dot(secondDirection), -1, 1);
  const angle = Math.acos(dot);
  if (!Number.isFinite(angle) || angle <= 1e-3) return null;
  const inPlane = secondDirection.clone().addScaledVector(firstDirection, -dot);
  if (inPlane.length() <= 1e-5) return null;
  inPlane.normalize();
  const safeRadius = Math.min(
    radius,
    firstLength * 0.999,
    secondLength * 0.999
  );
  if (safeRadius <= VECTOR3_NUMERIC_EPSILON) return null;
  const segments = Math.max(8, segmentCount);
  return Array.from({ length: segments + 1 }, (_, index) => {
    const theta = angle * (index / segments);
    return firstDirection
      .clone()
      .multiplyScalar(Math.cos(theta))
      .addScaledVector(inPlane, Math.sin(theta))
      .normalize()
      .multiplyScalar(safeRadius)
      .add(corner);
  });
};
