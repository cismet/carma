import type { Vector3 } from "three";

import { VECTOR3_NUMERIC_EPSILON } from "./constants";

const EPSILON_SQUARED = VECTOR3_NUMERIC_EPSILON * VECTOR3_NUMERIC_EPSILON;

/** Mean of the positions; null without any. */
export const getVector3Centroid = (
  positions: readonly Vector3[]
): Vector3 | null =>
  positions.length === 0
    ? null
    : positions
        .reduce(
          (sum, position) => sum.add(position),
          positions[0]!.clone().setScalar(0)
        )
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

/** Unit copy of the direction; null for a degenerate one. */
export const normalizeVector3Direction = (direction: Vector3): Vector3 | null =>
  direction.lengthSq() <= EPSILON_SQUARED
    ? null
    : direction.clone().normalize();

export const removeVector3ComponentAlongAxis = (
  vector: Vector3,
  axisDirection: Vector3,
  out: Vector3 = vector.clone()
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
