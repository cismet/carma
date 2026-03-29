/* eslint-disable carma/allowlist-math-library-(dependency-free) */
// Intentionally depends on three.js:
// Matrix4 is a CARMA-native 3D math type and must stay interoperable with
// engine/runtime code without custom matrix wrappers.
import { Matrix4 } from "three";
import { isFiniteNumber } from "./numeric/is-finite-number";

export const coerceMatrix4 = (value: unknown): Matrix4 | null => {
  if (value instanceof Matrix4) {
    return value.clone();
  }
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<number, unknown>;
  const elements: number[] = [];
  for (let index = 0; index < 16; index += 1) {
    const entry = candidate[index];
    if (!isFiniteNumber(entry)) {
      return null;
    }
    elements[index] = entry;
  }

  const matrix = new Matrix4();
  const targetElements = matrix.elements;
  for (let index = 0; index < 16; index += 1) {
    targetElements[index] = elements[index] as number;
  }
  return matrix;
};
