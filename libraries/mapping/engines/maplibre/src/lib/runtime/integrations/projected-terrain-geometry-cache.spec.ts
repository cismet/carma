import { BufferGeometry, Float32BufferAttribute, Vector3 } from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { stored, storage } = vi.hoisted(() => {
  const stored = new Map<string, unknown>();
  return {
    stored,
    storage: {
      clear: vi.fn(async () => stored.clear()),
      getItem: vi.fn(async (key: string) => stored.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: unknown) => {
        stored.set(key, value);
        return value;
      }),
    },
  };
});

vi.mock("localforage", () => ({
  default: { createInstance: vi.fn(() => storage) },
}));

import {
  createProjectedTerrainGeometryCache,
  PROJECTED_TERRAIN_GEOMETRY_CACHE_REVISION,
} from "./projected-terrain-geometry-cache";

const tile = {
  id: { level: 10, x: 532, y: 218 },
  bounds: { west: 7.1, south: 51.2, east: 7.2, north: 51.3 },
  u: new Float32Array([0, 0, 1]),
  v: new Float32Array([0, 1, 0]),
  heightMeters: new Float32Array([100, 110, 120]),
  minimumHeightMeters: 100,
  maximumHeightMeters: 120,
  indices: new Uint32Array([0, 1, 2]),
  westIndices: new Uint32Array(),
  southIndices: new Uint32Array(),
  eastIndices: new Uint32Array(),
  northIndices: new Uint32Array(),
  childTileMask: 15,
  geometricErrorMeters: 10,
  byteLength: 60,
};

const createGeometry = () => {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, -1], 3)
  );
  geometry.setIndex([0, 1, 2]);
  geometry.computeVertexNormals();
  return geometry;
};

describe("projected terrain geometry cache", () => {
  beforeEach(() => {
    stored.clear();
    vi.clearAllMocks();
  });

  it("restores a transformed tile before its source must be requested", async () => {
    stored.set("__conversion_revision__", "older-conversion");
    stored.set("stale-tile", { positions: new Float32Array() });
    const cache = createProjectedTerrainGeometryCache(
      "https://example.test/terrain",
      [7.15, 51.25]
    );
    const geometry = createGeometry();

    expect(await cache.get(tile.id)).toBeNull();
    cache.set(tile, geometry);
    const restored = await cache.get(tile.id);

    expect(storage.clear).toHaveBeenCalledOnce();
    expect(stored.get("__conversion_revision__")).toBe(
      PROJECTED_TERRAIN_GEOMETRY_CACHE_REVISION
    );
    expect(stored.has("stale-tile")).toBe(false);
    expect(restored?.tile).not.toBe(tile);
    expect(restored?.tile.id).toEqual(tile.id);
    expect(restored?.tile.heightMeters).toEqual(tile.heightMeters);
    expect(
      new Vector3().fromBufferAttribute(
        restored!.geometry.getAttribute("normal"),
        0
      ).y
    ).toBeGreaterThan(0);

    const otherSource = createProjectedTerrainGeometryCache(
      "https://example.test/other-terrain",
      [7.15, 51.25]
    );
    expect(await otherSource.get(tile.id)).toBeNull();

    geometry.dispose();
    restored?.geometry.dispose();
  });
});
