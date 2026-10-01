export type MeshPositionBits = 8 | 12 | 16;
export type MeshPositionQuantization = Readonly<{
  bits: MeshPositionBits;
  values: Uint8Array | Uint16Array;
  offset: readonly [number, number, number];
  /** Decode normalized GPU attributes by this scale, then add offset. */
  decodeScale: readonly [number, number, number];
  maximumError: number;
  errorBound: number;
}>;

/** Per-axis bounding-box encoding. Twelve bits use Uint16 storage on the GPU. */
export function quantizeMeshPositions(
  positions: ArrayLike<number>,
  bits: MeshPositionBits
): MeshPositionQuantization {
  if (bits !== 8 && bits !== 12 && bits !== 16)
    throw new RangeError("Mesh positions support 8, 12 or 16 effective bits");
  if (!positions.length || positions.length % 3)
    throw new RangeError("Mesh positions must contain nonempty XYZ triples");
  const minimum: [number, number, number] = [Infinity, Infinity, Infinity];
  const maximum: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index++) {
    const value = positions[index];
    if (!Number.isFinite(value))
      throw new TypeError("Mesh positions must be finite");
    const axis = index % 3;
    minimum[axis] = Math.min(minimum[axis], value);
    maximum[axis] = Math.max(maximum[axis], value);
  }
  const levels = 2 ** bits - 1;
  const normalizedDivisor = bits === 8 ? 255 : 65535;
  const extent = maximum.map((value, axis) => value - minimum[axis]);
  const decodeScale = extent.map((value) =>
    value ? (value * normalizedDivisor) / levels : 1
  ) as [number, number, number];
  const values =
    bits === 8
      ? new Uint8Array(positions.length)
      : new Uint16Array(positions.length);
  let maximumError = 0;
  for (let index = 0; index < positions.length; index += 3) {
    const errors: number[] = [];
    for (let axis = 0; axis < 3; axis++) {
      const value = positions[index + axis];
      const encoded = extent[axis]
        ? Math.round(((value - minimum[axis]) / extent[axis]) * levels)
        : 0;
      values[index + axis] = encoded;
      errors.push(
        value -
          (minimum[axis] + (encoded / normalizedDivisor) * decodeScale[axis])
      );
    }
    maximumError = Math.max(maximumError, Math.hypot(...errors));
  }
  return {
    bits,
    values,
    offset: minimum,
    decodeScale,
    maximumError,
    errorBound: Math.hypot(...extent.map((value) => value / (2 * levels))),
  };
}

/** Store Sᵀ n so Three's inverse-transpose normal matrix cancels decode scale S. */
export function compensateMeshNormalsForScale(
  normals: ArrayLike<number>,
  decodeScale: readonly [number, number, number]
): Float32Array {
  if (
    normals.length % 3 ||
    !decodeScale.every((value) => Number.isFinite(value) && value > 0)
  )
    throw new RangeError(
      "Normals require XYZ triples and a positive finite scale"
    );
  const result = new Float32Array(normals.length);
  for (let index = 0; index < normals.length; index += 3) {
    const x = normals[index] * decodeScale[0];
    const y = normals[index + 1] * decodeScale[1];
    const z = normals[index + 2] * decodeScale[2];
    const length = Math.hypot(x, y, z);
    if (!Number.isFinite(length))
      throw new TypeError("Mesh normals must be finite");
    if (length) result.set([x / length, y / length, z / length], index);
  }
  return result;
}
