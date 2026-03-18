/* eslint-disable carma/allowlist-math-library-(dependency-free) */
// Intentionally depends on three.js:
// Matrix4 is a CARMA-native 3D math type and must stay interoperable with
// engine/runtime code without custom matrix wrappers.
import { Matrix4 } from "three";
import { isFiniteNumber } from "./numeric/isFiniteNumber";

export { Matrix4 };
export type Matrix4Json = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number
];

export type Matrix4Like = Matrix4 | Matrix4Json;

export const matrix4ToJson = (matrix: Matrix4): Matrix4Json => {
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

export const matrix4FromJson = (json: Matrix4Json): Matrix4 => {
  const matrix = new Matrix4();
  const elements = matrix.elements;
  for (let index = 0; index < 16; index += 1) {
    elements[index] = json[index];
  }
  return matrix;
};

export const coerceMatrix4Json = (value: unknown): Matrix4Json | null => {
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

  return json as Matrix4Json;
};

export const coerceMatrix4 = (value: unknown): Matrix4 | null => {
  if (value instanceof Matrix4) {
    return value.clone();
  }
  const json = coerceMatrix4Json(value);
  return json ? matrix4FromJson(json) : null;
};
