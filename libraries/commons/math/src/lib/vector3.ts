/* eslint-disable carma/allowlist-math-library-(dependency-free) */
// Intentionally depends on three.js:
// Vector3 is a CARMA-native 3D math type across mapping/runtime code.
import { Vector3 } from "three";

export type Vector3Arr = [number, number, number];
export type Matrix3RowMajor = [
  [number, number, number],
  [number, number, number],
  [number, number, number]
];

import { isFiniteNumber } from "./numeric/is-finite-number";

export const coerceVector3 = (value: unknown): Vector3 | null => {
  if (value instanceof Vector3) {
    return value.clone();
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as { x?: unknown; y?: unknown; z?: unknown };
  if (
    !isFiniteNumber(candidate.x) ||
    !isFiniteNumber(candidate.y) ||
    !isFiniteNumber(candidate.z)
  ) {
    return null;
  }

  return new Vector3(candidate.x, candidate.y, candidate.z);
};
