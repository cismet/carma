import type { TerrainStitchInput } from "./terrain-boundary-stitch";

export const square = (
  x: number,
  z: number,
  height: number
): TerrainStitchInput => ({
  key: `${x}/${z}`,
  id: { level: 2, x, y: z },
  positions: new Float32Array([
    x,
    height,
    z,
    x + 1,
    height,
    z,
    x,
    height,
    z + 1,
    x + 1,
    height,
    z + 1,
  ]),
  normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
  indices: new Uint16Array([0, 2, 1, 1, 2, 3]),
  boundaryEdges: {
    west: new Uint32Array([0, 2]),
    east: new Uint32Array([1, 3]),
    north: new Uint32Array([0, 1]),
    south: new Uint32Array([2, 3]),
  },
  boundaryBaseHeights: {
    west: new Float32Array([height, height]),
    east: new Float32Array([height, height]),
    north: new Float32Array([height, height]),
    south: new Float32Array([height, height]),
  },
});

// Includes interior faces omitted by the compact probe. Vary both slopes and
// source offsets so missing normal contributors cannot pass as flat terrain.
export const grid = (
  x: number,
  z: number,
  level = 2,
  size = 1,
  segments = 8
): TerrainStitchInput => {
  const width = segments + 1;
  const positions = new Float32Array(width * width * 3);
  const normals = new Float32Array(positions.length);
  const indices: number[] = [];
  for (let row = 0; row < width; row++) {
    for (let col = 0; col < width; col++) {
      const i = row * width + col;
      const px = x + (col * size) / segments;
      const pz = z + (row * size) / segments;
      positions.set([px, 7 * Math.sin(px * 2.7 + pz) + x + z, pz], i * 3);
      normals.set([0, 1, 0], i * 3);
      if (row < segments && col < segments)
        indices.push(i, i + width, i + 1, i + 1, i + width, i + width + 1);
    }
  }
  const edge = (start: number, step: number) =>
    Uint32Array.from({ length: width }, (_, i) => start + i * step);
  const boundaryEdges = {
    west: edge(0, width),
    east: edge(segments, width),
    north: edge(0, 1),
    south: edge(segments * width, 1),
  };
  const boundaryBaseHeights = Object.fromEntries(
    Object.entries(boundaryEdges).map(([side, vertices]) => [
      side,
      Float32Array.from(vertices, (i) => positions[i * 3 + 1]),
    ])
  ) as TerrainStitchInput["boundaryBaseHeights"];
  return {
    key: `${level}/${x}/${z}`,
    id: { level, x: x / size, y: z / size },
    positions,
    normals,
    indices: new Uint16Array(indices),
    boundaryEdges,
    boundaryBaseHeights,
  };
};
