import type { Vector3 } from "three";

import type { Matrix3RowMajor, Vector3Arr } from "../vector3";

const OFF_DIAGONAL_INDEX_PAIRS = [
  [0, 1],
  [0, 2],
  [1, 2],
] as const;
const JACOBI_MAX_ITERATIONS = 32;
const JACOBI_OFF_DIAGONAL_EPSILON = 1e-10;

const getValue = (
  matrix: Matrix3RowMajor,
  row: number,
  column: number
): number => matrix[row]?.[column] ?? 0;

const setValue = (
  matrix: Matrix3RowMajor,
  row: number,
  column: number,
  value: number
) => {
  const rowValues = matrix[row];
  if (rowValues) {
    rowValues[column] = value;
  }
};

const findLargestOffDiagonalEntry = (matrix: Matrix3RowMajor) =>
  OFF_DIAGONAL_INDEX_PAIRS.map(([row, column]) => ({
    row,
    column,
    value: Math.abs(getValue(matrix, row, column)),
  })).reduce((best, entry) => (entry.value > best.value ? entry : best));

/** Unnormalised covariance (sum of outer products) of the points around the center. */
export const computeCovarianceMatrix3 = (
  points: readonly Vector3[],
  center: Vector3
): Matrix3RowMajor => {
  const covariance: Matrix3RowMajor = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  points.forEach((point) => {
    const values = [
      point.x - center.x,
      point.y - center.y,
      point.z - center.z,
    ] as const;
    for (let row = 0; row < 3; row += 1) {
      for (let column = row; column < 3; column += 1) {
        const next =
          getValue(covariance, row, column) +
          (values[row] ?? 0) * (values[column] ?? 0);
        setValue(covariance, row, column, next);
        setValue(covariance, column, row, next);
      }
    }
  });
  return covariance;
};

/**
 * Jacobi eigen decomposition of a symmetric 3x3 matrix: the eigenvector of
 * the smallest eigenvalue, of unit length up to rounding.
 */
export const resolveSmallestEigenVectorSymmetricMatrix3 = (
  sourceMatrix: Matrix3RowMajor
): Vector3Arr => {
  const matrix = sourceMatrix.map((row) => [...row]) as Matrix3RowMajor;
  const eigenvectors: Matrix3RowMajor = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  for (let iteration = 0; iteration < JACOBI_MAX_ITERATIONS; iteration += 1) {
    const { row, column, value } = findLargestOffDiagonalEntry(matrix);
    if (value <= JACOBI_OFF_DIAGONAL_EPSILON) break;

    const pp = getValue(matrix, row, row);
    const qq = getValue(matrix, column, column);
    const pq = getValue(matrix, row, column);
    const angle = 0.5 * Math.atan2(2 * pq, qq - pp);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    for (let index = 0; index < 3; index += 1) {
      if (index === row || index === column) continue;

      const ip = getValue(matrix, index, row);
      const iq = getValue(matrix, index, column);
      const nextIp = cos * ip - sin * iq;
      const nextIq = sin * ip + cos * iq;
      setValue(matrix, index, row, nextIp);
      setValue(matrix, row, index, nextIp);
      setValue(matrix, index, column, nextIq);
      setValue(matrix, column, index, nextIq);
    }

    setValue(
      matrix,
      row,
      row,
      cos * cos * pp - 2 * sin * cos * pq + sin * sin * qq
    );
    setValue(
      matrix,
      column,
      column,
      sin * sin * pp + 2 * sin * cos * pq + cos * cos * qq
    );
    setValue(matrix, row, column, 0);
    setValue(matrix, column, row, 0);

    for (let index = 0; index < 3; index += 1) {
      const vectorIp = getValue(eigenvectors, index, row);
      const vectorIq = getValue(eigenvectors, index, column);
      setValue(eigenvectors, index, row, cos * vectorIp - sin * vectorIq);
      setValue(eigenvectors, index, column, sin * vectorIp + cos * vectorIq);
    }
  }

  let smallestIndex = 0;
  for (let index = 1; index < 3; index += 1) {
    if (
      getValue(matrix, index, index) <
      getValue(matrix, smallestIndex, smallestIndex)
    ) {
      smallestIndex = index;
    }
  }

  return [
    getValue(eigenvectors, 0, smallestIndex),
    getValue(eigenvectors, 1, smallestIndex),
    getValue(eigenvectors, 2, smallestIndex),
  ];
};
