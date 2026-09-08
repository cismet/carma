export type RasterMeshReduction = Readonly<{
  indices: Uint32Array;
  stride: 2 | 4;
  maximumErrorMeters: number;
}>;

export const MAXIMUM_RASTER_MESH_ERROR_METERS = 0.01;

/** Downward binary buckets bound variant counts without relaxing the request. */
export const resolveRasterMeshErrorMeters = (
  requested = MAXIMUM_RASTER_MESH_ERROR_METERS
): number => {
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  if (requested >= MAXIMUM_RASTER_MESH_ERROR_METERS)
    return MAXIMUM_RASTER_MESH_ERROR_METERS;
  const level = Math.ceil(
    Math.log2(MAXIMUM_RASTER_MESH_ERROR_METERS / requested)
  );
  return level > 16 ? 0 : MAXIMUM_RASTER_MESH_ERROR_METERS / 2 ** level;
};

type Pixel = readonly [x: number, y: number];
type PixelTriangle = readonly [Pixel, Pixel, Pixel];
// Topology only, never source heights. Worker transfers receive owned copies so
// neither a caller nor postMessage can detach this small reusable plan.
const reductionTopologies = new Map<string, Uint32Array>();
const MAXIMUM_TOPOLOGY_ENTRIES = 4;
const MAXIMUM_TOPOLOGY_BYTES = 2 * 1024 * 1024;

/** The reference is the native pixel-centre grid with NE–SW diagonals. */
const sampleTriangleSurface = (
  heights: Float32Array,
  rowLength: number,
  width: number,
  height: number,
  x: number,
  y: number
): number => {
  const column = Math.min(width - 2, Math.max(0, Math.floor(x)));
  const row = Math.min(height - 2, Math.max(0, Math.floor(y)));
  const dx = x - column;
  const dy = y - row;
  const northWest = (row + 1) * rowLength + column + 1;
  if (dx + dy <= 1) {
    const a = heights[northWest];
    return (
      a +
      dx * (heights[northWest + 1] - a) +
      dy * (heights[northWest + rowLength] - a)
    );
  }
  const a = heights[northWest + rowLength + 1];
  return (
    a +
    (1 - dx) * (heights[northWest + rowLength] - a) +
    (1 - dy) * (heights[northWest + 1] - a)
  );
};

/**
 * Exact piecewise-linear overlay candidates: native vertices inside the coarse
 * triangle and coarse-edge intersections with native x/y/diagonal grid lines.
 * Pixel-only checks miss extrema where the two triangulations cross.
 */
export const getRasterTriangleErrorMeters = (
  triangle: PixelTriangle,
  heights: Float32Array,
  rowLength: number,
  width: number,
  height: number,
  maximumError: number
): number => {
  const [a, b, c] = triangle;
  const at = ([x, y]: Pixel) => heights[(y + 1) * rowLength + x + 1];
  const az = at(a);
  const bz = at(b);
  const cz = at(c);
  const determinant =
    (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  if (!determinant || ![az, bz, cz].every(Number.isFinite))
    return Number.POSITIVE_INFINITY;
  const slopeX =
    ((bz - az) * (c[1] - a[1]) - (cz - az) * (b[1] - a[1])) / determinant;
  const slopeY =
    ((b[0] - a[0]) * (cz - az) - (c[0] - a[0]) * (bz - az)) / determinant;
  let error = 0;
  const measure = (x: number, y: number) => {
    const reference = sampleTriangleSurface(
      heights,
      rowLength,
      width,
      height,
      x,
      y
    );
    const candidate = az + slopeX * (x - a[0]) + slopeY * (y - a[1]);
    const residual = Math.abs(reference - candidate);
    error = Number.isFinite(residual) ? Math.max(error, residual) : Infinity;
  };
  const minimumX = Math.min(a[0], b[0], c[0]);
  const maximumX = Math.max(a[0], b[0], c[0]);
  const minimumY = Math.min(a[1], b[1], c[1]);
  const maximumY = Math.max(a[1], b[1], c[1]);
  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      const u =
        ((x - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (y - a[1])) / determinant;
      const v =
        ((b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1])) / determinant;
      if (u >= 0 && v >= 0 && u + v <= 1) measure(x, y);
      if (error > maximumError) return error;
    }
  }
  for (let edge = 0; edge < 3; edge += 1) {
    const start = triangle[edge];
    const end = triangle[(edge + 1) % 3];
    // All reference triangle edges belong to x=k, y=k or x+y=k.
    for (let axis = 0; axis < 3; axis += 1) {
      const from = axis === 2 ? start[0] + start[1] : start[axis];
      const to = axis === 2 ? end[0] + end[1] : end[axis];
      if (from === to) continue;
      for (
        let line = Math.ceil(Math.min(from, to));
        line <= Math.max(from, to);
        line += 1
      ) {
        const fraction = (line - from) / (to - from);
        measure(
          start[0] + fraction * (end[0] - start[0]),
          start[1] + fraction * (end[1] - start[1])
        );
        if (error > maximumError) return error;
      }
    }
  }
  return error;
};

const blockTriangles = (
  x: number,
  y: number,
  stride: 2 | 4,
  endX: number,
  endY: number
): readonly PixelTriangle[] => {
  const northWest: Pixel = [x, y];
  const southWest: Pixel = [x, y + stride];
  const northEast: Pixel = [x + stride, y];
  const southEast: Pixel = [x + stride, y + stride];
  if (x !== 1 && y !== 1 && x + stride !== endX && y + stride !== endY)
    return [
      [northWest, southWest, northEast],
      [northEast, southWest, southEast],
    ];

  // The native boundary strip is not simplified. Transition fans retain every
  // shared pixel and have no T junctions, including the two corner transitions.
  const perimeter: Pixel[] = [];
  for (let offset = 0; offset < stride; offset += x === 1 ? 1 : stride)
    perimeter.push([x, y + offset]);
  for (
    let offset = 0;
    offset < stride;
    offset += y + stride === endY ? 1 : stride
  )
    perimeter.push([x + offset, y + stride]);
  for (
    let offset = 0;
    offset < stride;
    offset += x + stride === endX ? 1 : stride
  )
    perimeter.push([x + stride, y + stride - offset]);
  for (let offset = 0; offset < stride; offset += y === 1 ? 1 : stride)
    perimeter.push([x + stride - offset, y]);
  const center: Pixel = [x + stride / 2, y + stride / 2];
  return perimeter.map<PixelTriangle>((point, index) => [
    center,
    point,
    perimeter[(index + 1) % perimeter.length],
  ]);
};

const affineEnvelopeError = (
  heights: Float32Array,
  width: number,
  height: number,
  maximumError: number
) => {
  const rowLength = width + 2;
  const start = rowLength + 1;
  const base = heights[start];
  const dx = heights[start + 1] - base;
  const dy = heights[start + rowLength] - base;
  let maximumResidual = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const residual = Math.abs(
        heights[(y + 1) * rowLength + x + 1] - (base + dx * x + dy * y)
      );
      if (!Number.isFinite(residual) || residual * 2 > maximumError)
        return Infinity;
      maximumResidual = Math.max(maximumResidual, residual);
    }
  }
  // Both triangle surfaces are convex combinations of source vertices. If all
  // vertices are within e of one affine plane, their difference is <=2e even
  // between pixels. This cheap certificate never replaces a failed audit.
  return maximumResidual * 2;
};

/**
 * Decision: bounded regular reductions, not live TIN selection. RME-01 in
 * RASTER_MESH_LOD.md explains the residual proof, native edge strip and limits.
 * All coordinates index the same native pixel centres; no averaging/blur occurs.
 */
export const reduceRasterMesh = (
  heights: Float32Array,
  width: number,
  height: number,
  maximumErrorMeters: number
): RasterMeshReduction | null => {
  const rowLength = width + 2;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 8 ||
    height < 8 ||
    heights.length !== rowLength * (height + 2) ||
    !Number.isFinite(maximumErrorMeters) ||
    maximumErrorMeters < 0
  )
    return null;
  const envelopeError = affineEnvelopeError(
    heights,
    width,
    height,
    maximumErrorMeters
  );
  for (const stride of [4, 2] as const) {
    const endX = 1 + Math.floor((width - 3) / stride) * stride;
    const endY = 1 + Math.floor((height - 3) / stride) * stride;
    if (endX <= 1 || endY <= 1) continue;
    const topologyKey = `${width}/${height}/${stride}`;
    const cachedTopology = reductionTopologies.get(topologyKey);
    if (cachedTopology && Number.isFinite(envelopeError))
      return {
        indices: cachedTopology.slice(),
        stride,
        maximumErrorMeters: envelopeError,
      };
    const interior: number[] = [];
    let error = 0;
    let accepted = true;
    for (let y = 1; y < endY && accepted; y += stride) {
      for (let x = 1; x < endX && accepted; x += stride) {
        for (const triangle of blockTriangles(x, y, stride, endX, endY)) {
          error = Math.max(
            error,
            Number.isFinite(envelopeError)
              ? envelopeError
              : getRasterTriangleErrorMeters(
                  triangle,
                  heights,
                  rowLength,
                  width,
                  height,
                  maximumErrorMeters
                )
          );
          if (error > maximumErrorMeters) {
            accepted = false;
            break;
          }
          for (const [column, row] of triangle)
            interior.push((row + 1) * rowLength + column + 1);
        }
      }
    }
    if (!accepted) continue;
    // Native outer ring and its adjoining pixel cells keep identical topology.
    const indices: number[] = [];
    for (let row = 0; row <= height; row += 1) {
      for (let column = 0; column <= width; column += 1) {
        if (row >= 2 && row <= endY && column >= 2 && column <= endX) continue;
        const northWest = row * rowLength + column;
        indices.push(
          northWest,
          northWest + rowLength,
          northWest + 1,
          northWest + 1,
          northWest + rowLength,
          northWest + rowLength + 1
        );
      }
    }
    const output = new Uint32Array(indices.length + interior.length);
    if (output.length >= (width + 1) * (height + 1) * 6) continue;
    output.set(indices);
    output.set(interior, indices.length);
    if (output.byteLength <= MAXIMUM_TOPOLOGY_BYTES) {
      let bytes = [...reductionTopologies.values()].reduce(
        (sum, topology) => sum + topology.byteLength,
        0
      );
      while (
        reductionTopologies.size &&
        (reductionTopologies.size >= MAXIMUM_TOPOLOGY_ENTRIES ||
          bytes + output.byteLength > MAXIMUM_TOPOLOGY_BYTES)
      ) {
        const oldestKey = reductionTopologies.keys().next().value!;
        bytes -= reductionTopologies.get(oldestKey)!.byteLength;
        reductionTopologies.delete(oldestKey);
      }
      reductionTopologies.set(topologyKey, output.slice());
    }
    return { indices: output, stride, maximumErrorMeters: error };
  }
  return null;
};
