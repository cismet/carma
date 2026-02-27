export type ReprojectionVec2 = {
  x: number;
  y: number;
};

export type ReprojectionVec3 = {
  x: number;
  y: number;
  z: number;
};

export type ReprojectionVec4 = {
  x: number;
  y: number;
  z: number;
  w: number;
};

export type CssViewMatrixOrder = "column-major" | "row-major";

export type CssViewMatrix4 =
  | readonly [
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
    ]
  | number[];

export type TransformPointWithMatrixOptions = {
  matrixOrder?: CssViewMatrixOrder;
};

export type ProjectPointToSvgOptions = TransformPointWithMatrixOptions & {
  perspectiveDivide?: boolean;
  ndcToScreen?: (xNdc: number, yNdc: number, zNdc: number) => ReprojectionVec3;
};

export type SvgProjectedPoint = ReprojectionVec2 & {
  z: number;
  w: number;
};

// Performance note:
// A naive batch projection path was benchmarked in Storybook against the
// per-point path and did not show meaningful gains (and could be slower on
// typical loads). The current implementation keeps the simpler per-point
// projection, which is already reasonably fast for expected point counts.

const ensure16 = (matrix: CssViewMatrix4): void => {
  if (matrix.length !== 16) {
    throw new Error(`Expected a 4x4 matrix (16 values), got ${matrix.length}.`);
  }
};

const roundFixed = (value: number, digits: number): string =>
  Number.isFinite(value) ? value.toFixed(digits) : "0";

const defaultNdcToScreen = (
  xNdc: number,
  yNdc: number,
  zNdc: number
): ReprojectionVec3 => ({
  x: xNdc,
  y: yNdc,
  z: zNdc,
});

/**
 * Multiply a point by a 4x4 view/projection-like matrix and return clip-space xyz + w.
 */
export const transformPointWithMatrix = (
  point: ReprojectionVec3,
  matrix: CssViewMatrix4,
  options: TransformPointWithMatrixOptions = {}
): ReprojectionVec4 => {
  ensure16(matrix);
  const { matrixOrder = "column-major" } = options;
  const x = point.x;
  const y = point.y;
  const z = point.z;

  if (matrixOrder === "row-major") {
    return {
      x: matrix[0] * x + matrix[1] * y + matrix[2] * z + matrix[3],
      y: matrix[4] * x + matrix[5] * y + matrix[6] * z + matrix[7],
      z: matrix[8] * x + matrix[9] * y + matrix[10] * z + matrix[11],
      w: matrix[12] * x + matrix[13] * y + matrix[14] * z + matrix[15],
    };
  }

  return {
    x: matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    y: matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    z: matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
    w: matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15],
  };
};

/**
 * Project one 3D point into 2D SVG coordinates via a supplied 4x4 matrix.
 */
export const projectPointToSvg = (
  point: ReprojectionVec3,
  matrix: CssViewMatrix4,
  options: ProjectPointToSvgOptions = {}
): SvgProjectedPoint | null => {
  const {
    matrixOrder = "column-major",
    perspectiveDivide = true,
    ndcToScreen = defaultNdcToScreen,
  } = options;

  const clip = transformPointWithMatrix(point, matrix, { matrixOrder });
  if (!Number.isFinite(clip.w)) return null;

  let x = clip.x;
  let y = clip.y;
  let z = clip.z;

  if (perspectiveDivide) {
    if (Math.abs(clip.w) < 1e-12) return null;
    x /= clip.w;
    y /= clip.w;
    z /= clip.w;
  }

  const screen = ndcToScreen(x, y, z);
  return {
    x: screen.x,
    y: screen.y,
    z: screen.z,
    w: clip.w,
  };
};

/**
 * Build the value for a polyline "points" attribute from 2D points.
 */
export const toSvgPolylinePoints = (
  points: ReprojectionVec2[],
  digits = 3
): string => {
  if (points.length === 0) return "";
  let value = "";
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (i > 0) value += " ";
    value += `${roundFixed(point.x, digits)},${roundFixed(point.y, digits)}`;
  }
  return value;
};

/**
 * Build an SVG path "d" string from 2D points.
 */
export const toSvgPathD = (
  points: ReprojectionVec2[],
  { close = false, digits = 3 }: { close?: boolean; digits?: number } = {}
): string => {
  if (points.length === 0) return "";
  const first = points[0];
  let d = `M ${roundFixed(first.x, digits)} ${roundFixed(first.y, digits)}`;

  for (let i = 1; i < points.length; i += 1) {
    const point = points[i];
    d += ` L ${roundFixed(point.x, digits)} ${roundFixed(point.y, digits)}`;
  }

  if (close) d += " Z";
  return d;
};
