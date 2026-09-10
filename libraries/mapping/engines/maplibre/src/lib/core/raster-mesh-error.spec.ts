import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import {
  getRasterTriangleErrorMeters,
  reduceRasterMesh,
  resolveRasterMeshErrorMeters,
} from "./raster-mesh-error";
import {
  buildErrorBoundedGridTile,
  buildGridTile,
} from "./raster-dem-tile";
import { createProjectedTerrainTileGeometry } from "@carma-mapping/engines/three/primitives/core";
import { createTerrainTileHeightSampler } from "./terrain-tile-height-sampler";

const id = { level: 15, x: 17_023, y: 10_926 };
const raster = (size: number, sample: (x: number, y: number) => number) => {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const encoded = Math.round((sample(x, y) + 32_768) * 256);
      pixels.set(
        [
          Math.floor(encoded / 65_536),
          Math.floor(encoded / 256) % 256,
          encoded % 256,
          255,
        ],
        (y * size + x) * 4
      );
    }
  }
  return { width: size, height: size, pixels };
};

describe("error-bounded regular raster meshes", () => {
  it("keeps stricter requests in downward, bounded cache buckets", () => {
    expect(resolveRasterMeshErrorMeters()).toBe(0.01);
    expect(resolveRasterMeshErrorMeters(100)).toBe(0.01);
    expect(resolveRasterMeshErrorMeters(0.009)).toBe(0.005);
    expect(resolveRasterMeshErrorMeters(0.0025)).toBe(0.0025);
    expect(resolveRasterMeshErrorMeters(1e-20)).toBe(0);
    for (const invalid of [NaN, Infinity, -1, 0])
      expect(resolveRasterMeshErrorMeters(invalid)).toBe(0);
  });

  it("bounds diagonal crossings even when every enclosed native sample has zero error", () => {
    const width = 6;
    const heights = new Float32Array(8 * 8);
    heights[(3 + 1) * 8 + 2 + 1] = 1;
    // The only nonzero native sample (2,3) is OUTSIDE this triangle. Its
    // neighbour's interpolation still enters the triangle at x+y=5.
    expect(
      getRasterTriangleErrorMeters(
        [
          [1, 1],
          [1, 2],
          [3, 3],
        ],
        heights,
        8,
        width,
        width,
        Infinity
      )
    ).toBeCloseTo(2 / 3, 12);
  });

  it("reduces an affine native surface without moving pixel-centre samples or tile borders", () => {
    const input = raster(32, (x, y) => 100 + x / 4 - y / 8);
    const native = buildGridTile(id, input, 32, 1);
    const reduced = buildErrorBoundedGridTile(id, input, 1);
    expect(reduced.rasterStride).toBe(4);
    expect(reduced.reconstructionErrorMeters).toBe(0);
    expect(reduced.indices.length).toBeLessThan(native.indices.length / 2);
    expect(reduced.u).toEqual(native.u);
    expect(reduced.v).toEqual(native.v);
    expect(reduced.heightMeters).toEqual(native.heightMeters);
    for (const edge of [
      "westIndices",
      "southIndices",
      "eastIndices",
      "northIndices",
    ] as const) {
      expect(
        [...reduced[edge]].map((i) => [
          reduced.u[i],
          reduced.v[i],
          reduced.heightMeters[i],
        ])
      ).toEqual(
        [...native[edge]].map((i) => [
          native.u[i],
          native.v[i],
          native.heightMeters[i],
        ])
      );
    }
    const nativeSamples = new Set(
      [...native.u].map(
        (u, i) => `${u},${native.v[i]},${native.heightMeters[i]}`
      )
    );
    for (let i = 0; i < reduced.u.length; i += 1)
      expect(
        nativeSamples.has(
          `${reduced.u[i]},${reduced.v[i]},${reduced.heightMeters[i]}`
        )
      ).toBe(true);
  });

  it("retains narrow source spikes and Terrarium sub-centimetre steps", () => {
    const input = raster(16, (x, y) => 100 + (x === 6 && y === 6 ? 1 : 0));
    const reduced = buildErrorBoundedGridTile(id, input, 1, 0.01);
    expect(reduced.rasterStride).toBe(1);
    expect(reduced.reconstructionErrorMeters).toBe(0);
    const noise = raster(16, (x, y) => 100 + (((x + y) % 2) * 2) / 256);
    expect(buildErrorBoundedGridTile(id, noise, 1, 0.01).rasterStride).not.toBe(
      1
    );
    expect(buildErrorBoundedGridTile(id, noise, 1, 0.001).rasterStride).toBe(1);
  });

  it("has exactly paired interior edges and the complete original boundary", () => {
    const tile = buildErrorBoundedGridTile(
      id,
      raster(24, () => 100),
      1
    );
    const counts = new Map<string, number>();
    for (let i = 0; i < tile.indices.length; i += 3) {
      for (let j = 0; j < 3; j += 1) {
        const a = tile.indices[i + j];
        const b = tile.indices[i + ((j + 1) % 3)];
        const key = a < b ? `${a}/${b}` : `${b}/${a}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const boundaryCount =
      tile.westIndices.length +
      tile.eastIndices.length +
      tile.southIndices.length +
      tile.northIndices.length -
      4;
    expect([...counts.values()].filter((count) => count === 1)).toHaveLength(
      boundaryCount
    );
    expect(
      [...counts.values()].every((count) => count === 1 || count === 2)
    ).toBe(true);
  });

  it("reuses only immutable topology, never another tile's elevation certificate", () => {
    const plane = buildGridTile(
      id,
      raster(16, () => 100),
      16,
      1
    );
    const first = reduceRasterMesh(plane.heightMeters, 16, 16, 0.01)!;
    const firstIndex = first.indices[0];
    first.indices[0] = 999_999;
    const second = reduceRasterMesh(plane.heightMeters, 16, 16, 0.01)!;
    expect(second.indices[0]).toBe(firstIndex);
    expect(second.indices.buffer).not.toBe(first.indices.buffer);
    const changed = plane.heightMeters.slice();
    changed[(6 + 1) * 18 + 6 + 1] += 1;
    expect(reduceRasterMesh(changed, 16, 16, 0.01)).toBeNull();
  });

  it("preserves all normals incident to the unchanged native boundary ring", () => {
    const input = raster(16, (x, y) => 100 + x / 4 + y / 8);
    const native = buildGridTile(id, input, 16, 1);
    const reduced = buildErrorBoundedGridTile(id, input, 1);
    const project = (
      longitude: number,
      latitude: number,
      height: number,
      target: Vector3
    ) => target.set(longitude * 1000, height, latitude * 1000);
    const fullGeometry = createProjectedTerrainTileGeometry({
      tile: native,
      projectToWorld: project,
    });
    const reducedGeometry = createProjectedTerrainTileGeometry({
      tile: reduced,
      projectToWorld: project,
    });
    const fullNormals = fullGeometry.getAttribute("normal");
    const reducedNormals = reducedGeometry.getAttribute("normal");
    for (const edge of [
      "westIndices",
      "southIndices",
      "eastIndices",
      "northIndices",
    ] as const) {
      for (let offset = 0; offset < native[edge].length; offset += 1) {
        const a = native[edge][offset];
        const b = reduced[edge][offset];
        expect([
          reducedNormals.getX(b),
          reducedNormals.getY(b),
          reducedNormals.getZ(b),
        ]).toEqual([
          fullNormals.getX(a),
          fullNormals.getY(a),
          fullNormals.getZ(a),
        ]);
      }
    }
    fullGeometry.dispose();
    reducedGeometry.dispose();
  });

  it("preserves the bounded native height-sampler fallback for a reduced cached tile", () => {
    const tile = buildErrorBoundedGridTile(
      id,
      raster(16, (x, y) => 100 + (x === 6 && y === 6 ? 1 / 256 : 0)),
      1
    );
    const sourceIndex = 7 * 18 + 7;
    expect(tile.rasterStride).toBe(4);
    expect(new Set(tile.indices).has(sourceIndex)).toBe(false);
    const sampler = createTerrainTileHeightSampler(tile);
    expect(sampler).not.toBeNull();
    const longitude =
      tile.bounds.west +
      tile.u[sourceIndex] * (tile.bounds.east - tile.bounds.west);
    const latitude =
      tile.bounds.south +
      tile.v[sourceIndex] * (tile.bounds.north - tile.bounds.south);
    expect(sampler!(longitude, latitude)).toBeCloseTo(100 + 1 / 256, 8);
  });

  it("falls back to native topology for unsupported or nonfinite input", () => {
    expect(reduceRasterMesh(new Float32Array(4), 2, 2, 0.01)).toBeNull();
    expect(
      reduceRasterMesh(new Float32Array(10 * 10).fill(NaN), 8, 8, 0.01)
    ).toBeNull();
    expect(reduceRasterMesh(new Float32Array(10 * 10), 8, 8, NaN)).toBeNull();
  });
});
