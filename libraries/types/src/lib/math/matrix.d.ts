/**
 * Row-major 2×2 (rotation) matrix
 * Compatible with Cesium's Matrix2 when flattened
 */
export type Matrix2RowMajor = [[number, number], [number, number]];

/**
 * Row-major 3×3 (rotation) matrix
 * Compatible with Cesium's Matrix3 when flattened
 */
export type Matrix3RowMajor = [
  [number, number, number],
  [number, number, number],
  [number, number, number]
];

/**
 * Row-major 4×4 transformation matrix
 * Encodes both rotation and translation
 * Compatible with Cesium's Matrix4 when flattened
 *
 * Format:
 * [R R R tx]
 * [R R R ty]
 * [R R R tz]
 * [0 0 0  1]
 *
 * Where R = rotation, t = translation
 */
export type Matrix4RowMajor = [
  [number, number, number, number],
  [number, number, number, number],
  [number, number, number, number],
  [number, number, number, number]
];
