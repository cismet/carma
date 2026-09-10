import { MercatorCoordinate } from "maplibre-gl";
import { Triangle, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { buildGridTile, type TerrainTile } from "./raster-dem-tile";
import { createTerrainTileHeightSampler } from "./terrain-tile-height-sampler";

const nativeTile = () => {
  const pixels = new Uint8ClampedArray(4 * 4 * 4);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const encoded = 32768 + 10 + x * 20 + y * 30;
      pixels.set(
        [Math.floor(encoded / 256), encoded % 256, 0, 255],
        (y * 4 + x) * 4
      );
    }
  }
  return buildGridTile(
    { level: 10, x: 532, y: 338 },
    { width: 4, height: 4, pixels },
    4,
    1
  );
};

// An intentionally exhaustive reference is okay for these 50 tiny fixture
// triangles; production lookup must never scan a full native DEM per label.
const referenceHeight = (
  tile: TerrainTile,
  longitude: number,
  latitude: number
) => {
  const point = MercatorCoordinate.fromLngLat([longitude, latitude]);
  const query = new Vector3(point.x, point.y, 0);
  const positions = Array.from(tile.u, (u, index) => {
    const projected = MercatorCoordinate.fromLngLat([
      tile.bounds.west + u * (tile.bounds.east - tile.bounds.west),
      tile.bounds.south +
        tile.v[index] * (tile.bounds.north - tile.bounds.south),
    ]);
    return new Vector3(projected.x, projected.y, 0);
  });
  const weights = new Vector3();
  for (let index = 0; index < tile.indices.length; index += 3) {
    const [a, b, c] = tile.indices.subarray(index, index + 3);
    if (
      Triangle.getBarycoord(
        query,
        positions[a],
        positions[b],
        positions[c],
        weights
      ) &&
      weights.x >= -1e-7 &&
      weights.y >= -1e-7 &&
      weights.z >= -1e-7
    )
      return (
        tile.heightMeters[a] * weights.x +
        tile.heightMeters[b] * weights.y +
        tile.heightMeters[c] * weights.z
      );
  }
  return undefined;
};

describe("mesh-lifetime terrain height fallback", () => {
  it("matches the native grid's Mercator triangles including warped boundary cells", () => {
    const tile = nativeTile();
    const sample = createTerrainTileHeightSampler(tile)!;
    const northWest = MercatorCoordinate.fromLngLat([
      tile.bounds.west,
      tile.bounds.north,
    ]);
    const southEast = MercatorCoordinate.fromLngLat([
      tile.bounds.east,
      tile.bounds.south,
    ]);
    for (const u of [0, 0.025, 0.1, 0.13, 0.37, 0.51, 0.87, 0.99, 1]) {
      for (const v of [0, 0.025, 0.1, 0.13, 0.37, 0.51, 0.87, 0.99, 1]) {
        const point = new MercatorCoordinate(
          northWest.x + u * (southEast.x - northWest.x),
          northWest.y + v * (southEast.y - northWest.y)
        ).toLngLat();
        // Avoid inverse-projection roundoff just outside the closed tile bounds.
        const longitude = Math.max(
          tile.bounds.west,
          Math.min(tile.bounds.east, point.lng)
        );
        const latitude = Math.max(
          tile.bounds.south,
          Math.min(tile.bounds.north, point.lat)
        );
        expect(sample(longitude, latitude)).toBeCloseTo(
          referenceHeight(tile, longitude, latitude)!,
          5
        );
      }
    }
  });

  it("owns only its sample snapshot and is unaffected by mutable restored views", () => {
    const tile = nativeTile();
    const { west, east, south, north } = tile.bounds;
    const longitude = (west + east) / 2;
    const latitude = (south + north) / 2;
    const sample = createTerrainTileHeightSampler(tile)!;
    const expected = sample(longitude, latitude);
    tile.u.fill(NaN);
    tile.v.fill(NaN);
    tile.heightMeters.fill(-9999);
    tile.indices.fill(0);
    Object.assign(tile.bounds, { west: -180, east: -179 });
    expect(sample(longitude, latitude)).toBe(expected);
  });

  it("does not interpolate across a no-data vertex or outside the tile", () => {
    const tile = nativeTile();
    tile.heightMeters.fill(100);
    tile.heightMeters[0] = -9999;
    const sample = createTerrainTileHeightSampler(tile, -9999)!;
    expect(sample(tile.bounds.west, tile.bounds.north)).toBeUndefined();
    expect(sample(tile.bounds.east, tile.bounds.south)).toBeCloseTo(100);
    expect(sample(tile.bounds.west - 1e-6, tile.bounds.north)).toBeUndefined();
    expect(sample(NaN, tile.bounds.north)).toBeUndefined();
  });

  it("supports small irregular index order without turning large foreign topology into a label scan", () => {
    const original = nativeTile();
    const tile: TerrainTile = {
      ...original,
      u: new Float32Array([0, 0, 1]),
      v: new Float32Array([0, 1, 0]),
      heightMeters: new Float32Array([10, 30, 50]),
      indices: new Uint32Array([2, 0, 1]),
      northIndices: new Uint32Array(),
      southIndices: new Uint32Array(),
      westIndices: new Uint32Array(),
      eastIndices: new Uint32Array(),
    };
    const sample = createTerrainTileHeightSampler(tile)!;
    expect(sample(tile.bounds.west, tile.bounds.north)).toBeCloseTo(30);
    expect(sample(tile.bounds.east, tile.bounds.north)).toBeUndefined();
    expect(
      createTerrainTileHeightSampler({
        ...tile,
        u: new Float32Array(257),
        v: new Float32Array(257),
        heightMeters: new Float32Array(257),
      })
    ).toBeNull();
  });
});
