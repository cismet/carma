import { Matrix4 } from "three";

import { isFiniteNumber } from "@carma/math";
// prettier-ignore
export type Matrix4ConstructorArgs = [
  column0Row0: number, column1Row0: number, column2Row0: number, column3Row0: number,
  column0Row1: number, column1Row1: number, column2Row1: number, column3Row1: number,
  column0Row2: number, column1Row2: number, column2Row2: number, column3Row2: number,
  column0Row3: number, column1Row3: number, column2Row3: number, column3Row3: number,
];

export const isMatrix4Json = (
  value: Matrix4ConstructorArgs | number[] | undefined | null
): value is Matrix4ConstructorArgs =>
  Array.isArray(value) && value.length === 16 && value.every(isFiniteNumber);

export const matrix4ToJson = (
  matrix: { elements?: unknown } | Matrix4 | null | undefined
): Matrix4ConstructorArgs | null => {
  const elements = (matrix as { elements?: unknown } | null | undefined)
    ?.elements;
  if (!Array.isArray(elements) || !isMatrix4Json(elements)) {
    return null;
  }
  return [...elements] as Matrix4ConstructorArgs;
};

export const matrix4FromJson = (value: Matrix4ConstructorArgs): Matrix4 =>
  new Matrix4().fromArray(value);
