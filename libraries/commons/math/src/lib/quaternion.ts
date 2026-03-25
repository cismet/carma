/* eslint-disable carma/allowlist-math-library-(dependency-free) */
// Intentionally depends on three.js:
// Quaternion is a CARMA-native 3D rotation type across camera/view code.
import { Quaternion } from "three";
import { isFiniteNumber } from "./numeric/isFiniteNumber";

export { Quaternion };
export type QuaternionJson = {
  x: number;
  y: number;
  z: number;
  w: number;
};

export const coerceQuaternion = (value: unknown): Quaternion | null => {
  if (value instanceof Quaternion) {
    return value.clone();
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    x?: unknown;
    y?: unknown;
    z?: unknown;
    w?: unknown;
  };
  if (
    !isFiniteNumber(candidate.x) ||
    !isFiniteNumber(candidate.y) ||
    !isFiniteNumber(candidate.z) ||
    !isFiniteNumber(candidate.w)
  ) {
    return null;
  }

  return new Quaternion(candidate.x, candidate.y, candidate.z, candidate.w);
};

export const quaternionToJson = (quaternion: Quaternion): QuaternionJson => ({
  x: quaternion.x,
  y: quaternion.y,
  z: quaternion.z,
  w: quaternion.w,
});

export const quaternionFromJson = (json: QuaternionJson): Quaternion =>
  new Quaternion(json.x, json.y, json.z, json.w);
