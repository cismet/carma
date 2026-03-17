/* eslint-disable carma/allowlist-math-library-(dependency-free) */
// Intentionally depends on three.js:
// Vector3 is a CARMA-native 3D math type across mapping/runtime code.
import { Vector3 } from "three";

export { Vector3 };
export type Vec3 = Vector3;
export type Vec3Json = {
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

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const coerceVec3 = (value: unknown): Vec3 | null => {
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

export const vec3ToJson = (vec3: Vec3): Vec3Json => ({
  x: vec3.x,
  y: vec3.y,
  z: vec3.z,
});

export const vec3FromJson = (json: Vec3Json): Vec3 =>
  new Vector3(json.x, json.y, json.z);
