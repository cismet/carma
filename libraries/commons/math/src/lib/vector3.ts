/* eslint-disable carma/allowlist-math-library-(dependency-free) */
// Intentionally depends on three.js:
// Vector3 is a CARMA-native 3D math type across mapping/runtime code.
import { Vector3 } from "three";

export { Vector3 };
export type Vector3Json = {
  x: number;
  y: number;
  z: number;
};
export type Vector3Arr = [number, number, number];
export type Matrix3RowMajor = [
  [number, number, number],
  [number, number, number],
  [number, number, number]
];

import { isFiniteNumber } from "./numeric/isFiniteNumber";

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

export const vector3ToJson = (vector3: Vector3): Vector3Json => ({
  x: vector3.x,
  y: vector3.y,
  z: vector3.z,
});

export const vector3FromJson = (json: Vector3Json): Vector3 =>
  new Vector3(json.x, json.y, json.z);
