export type Vector3Arr = [number, number, number];

// Row-major 3x3 matrix
export type Matrix3RowMajor = [
  [number, number, number],
  [number, number, number],
  [number, number, number]
];

export type NumericResult = {
  value: number | null;
  error?: string;
};
