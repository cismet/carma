/* eslint-disable carma/allowlist-math-library-(dependency-free) */
// Intentionally depends on three.js:
// Quaternion is a CARMA-native 3D rotation type across camera/view code.
import { Quaternion } from "three";
import { isFiniteNumber } from "./vec3";

export { Quaternion };
export type Quat = Quaternion;
export type QuatJson = {
  x: number;
  y: number;
  z: number;
  w: number;
};

export const coerceQuat = (value: unknown): Quat | null => {
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

export const quatToJson = (quat: Quat): QuatJson => ({
  x: quat.x,
  y: quat.y,
  z: quat.z,
  w: quat.w,
});

export const quatFromJson = (json: QuatJson): Quat =>
  new Quaternion(json.x, json.y, json.z, json.w);
