/* eslint-disable carma/allowlist-math-library-(dependency-free) */
// Intentionally depends on three.js:
// Matrix4 is a CARMA-native 3D math type and must stay interoperable with
// engine/runtime code without custom matrix wrappers.
import { Matrix4 } from "three";
import { isFiniteNumber } from "./numeric/isFiniteNumber";

export { Matrix4 };
export type Mat4 = Matrix4;

// prettier-ignore
export type Mat4Json = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

export const mat4ToJson = (matrix: Mat4): Mat4Json => {
  const elements = matrix.elements;
  return [
    elements[0],
    elements[1],
    elements[2],
    elements[3],
    elements[4],
    elements[5],
    elements[6],
    elements[7],
    elements[8],
    elements[9],
    elements[10],
    elements[11],
    elements[12],
    elements[13],
    elements[14],
    elements[15],
  ];
};

export const mat4FromJson = (json: Mat4Json): Mat4 => {
  const matrix = new Matrix4();
  const elements = matrix.elements;
  for (let index = 0; index < 16; index += 1) {
    elements[index] = json[index];
  }
  return matrix;
};

export const coerceMat4Json = (value: unknown): Mat4Json | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<number, unknown>;
  const json: number[] = [];
  for (let index = 0; index < 16; index += 1) {
    const entry = candidate[index];
    if (!isFiniteNumber(entry)) {
      return null;
    }
    json[index] = entry;
  }

  return json as Mat4Json;
};

export const coerceMat4 = (value: unknown): Mat4 | null => {
  if (value instanceof Matrix4) {
    return value.clone();
  }
  const json = coerceMat4Json(value);
  return json ? mat4FromJson(json) : null;
};
