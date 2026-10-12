import { Vector3 } from "three";

import { clamp } from "../numeric";
import { VECTOR3_NUMERIC_EPSILON } from "./constants";

const EPSILON_SQUARED = VECTOR3_NUMERIC_EPSILON * VECTOR3_NUMERIC_EPSILON;

/** Mean of the positions; null without any. */
export const getVector3Centroid = (
  positions: readonly Vector3[]
): Vector3 | null =>
  positions.length === 0
    ? null
    : positions
        .reduce((sum, position) => sum.add(position), new Vector3())
        .divideScalar(positions.length);

/** A copy moved toward the target by at most that distance. */
export const moveVector3Toward = (
  position: Vector3,
  target: Vector3,
  distance: number
): Vector3 => {
  const toward = target.clone().sub(position);
  const length = toward.length();
  return length > 0
    ? position
        .clone()
        .addScaledVector(toward, Math.min(distance, length) / length)
    : position.clone();
};

/** Null for a degenerate direction. */
export const normalizeDirection = (direction: Vector3): Vector3 | null =>
  direction.lengthSq() <= EPSILON_SQUARED
    ? null
    : direction.clone().normalize();

export const removeVector3ComponentAlongAxis = (
  vector: Vector3,
  axisDirection: Vector3,
  out: Vector3 = new Vector3()
): Vector3 => {
  const axisLengthSquared = axisDirection.lengthSq();
  return axisLengthSquared <= EPSILON_SQUARED
    ? out.copy(vector)
    : out
        .copy(vector)
        .addScaledVector(
          axisDirection,
          -vector.dot(axisDirection) / axisLengthSquared
        );
};

export const projectVector3OntoPlane = (
  point: Vector3,
  planeOrigin: Vector3,
  planeNormal: Vector3,
  out: Vector3 = new Vector3()
): Vector3 => {
  const normalLengthSquared = planeNormal.lengthSq();
  if (normalLengthSquared <= EPSILON_SQUARED) return out.copy(point);
  const offset = new Vector3().subVectors(point, planeOrigin).dot(planeNormal);
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
    : new Vector3().subVectors(point, planeOrigin).dot(planeNormal) /
        normalLength;
};

export const getNormalizedTriangleNormal = (
  a: Vector3,
  b: Vector3,
  c: Vector3,
  out: Vector3 = new Vector3()
): Vector3 | null => {
  out.crossVectors(
    new Vector3().subVectors(b, a),
    new Vector3().subVectors(c, a)
  );
  return out.lengthSq() <= EPSILON_SQUARED ? null : out.normalize();
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
  const first = new Vector3().subVectors(firstLegEnd, corner);
  const second = new Vector3().subVectors(secondLegEnd, corner);
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
    return new Vector3()
      .addScaledVector(firstDirection, Math.cos(theta))
      .addScaledVector(inPlane, Math.sin(theta))
      .normalize()
      .multiplyScalar(safeRadius)
      .add(corner);
  });
};
