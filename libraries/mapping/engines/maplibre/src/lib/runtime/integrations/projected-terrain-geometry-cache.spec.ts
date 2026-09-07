import {
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  Vector3,
} from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { stored, storage } = vi.hoisted(() => {
  const stored = new Map<string, unknown>();
  return {
    stored,
    storage: {
      clear: vi.fn(async () => stored.clear()),
      driver: vi.fn(() => "asyncStorage"),
      getItem: vi.fn(async (key: string) =>
        structuredClone(stored.get(key) ?? null)
      ),
      setItem: vi.fn(async (key: string, value: unknown) => {
        stored.set(key, structuredClone(value));
        return value;
      }),
    },
  };
});

vi.mock("localforage", () => ({
  default: {
    INDEXEDDB: "asyncStorage",
    createInstance: vi.fn(() => storage),
  },
}));

let createProjectedTerrainGeometryCache: typeof import("./projected-terrain-geometry-cache").createProjectedTerrainGeometryCache;
let PROJECTED_TERRAIN_GEOMETRY_CACHE_REVISION: string;

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
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

const reliefVertexMask = new Uint8Array([1, 1, 1]);
describe("projected terrain geometry cache", () => {
  beforeEach(async () => {
    vi.resetModules();
    stored.clear();
    storage.clear.mockClear();
    storage.driver.mockReset().mockReturnValue("asyncStorage");
    storage.getItem
      .mockReset()
      .mockImplementation(async (key) =>
        structuredClone(stored.get(key) ?? null)
      );
    storage.setItem.mockReset().mockImplementation(async (key, value) => {
      stored.set(key, structuredClone(value));
      return value;
    });
    ({
      createProjectedTerrainGeometryCache,
      PROJECTED_TERRAIN_GEOMETRY_CACHE_REVISION,
    } = await import("./projected-terrain-geometry-cache"));
    stored.set(
      "__conversion_revision__",
      PROJECTED_TERRAIN_GEOMETRY_CACHE_REVISION
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it("dispatches only a cache key and transfers validated read buffers without cloning them again", async () => {
    const worker = await import("./terrain-worker-client");
    const dispatch = vi.spyOn(worker, "runTerrainWorkerTask");
    const cache = createProjectedTerrainGeometryCache(
      "terrain-worker-read",
      [7.15, 51.25],
      undefined
    );
    const geometry = createGeometry();
    cache.set(tile, geometry, reliefVertexMask);
    const restored = await cache.get(tile.id);
    expect(dispatch).toHaveBeenCalledWith({
      kind: "read-cache",
      key: expect.any(String),
    });
    const result = await dispatch.mock.results[0].value;
    expect(result.kind).toBe("read-cache");
    const { terrainResultTransfers } = await import("./terrain-worker-task");
    const transfers = terrainResultTransfers(result);
    expect(transfers.length).toBeGreaterThan(0);
    expect(new Set(transfers).size).toBe(transfers.length);
    const received = structuredClone(result, { transfer: transfers });
    expect(result.entry.geometry.positions.byteLength).toBe(0);
    expect(received.entry.geometry.positions).toEqual(
      geometry.getAttribute("position").array
    );
    expect(received.entry.reliefVertexMask).toEqual(reliefVertexMask);
    // Detached worker-side buffers cannot corrupt the persistent record.
    expect(
      (await cache.get(tile.id))?.geometry?.getAttribute("position").array
    ).toEqual(geometry.getAttribute("position").array);
    restored?.geometry?.dispose();
    geometry.dispose();
  });

  it("restores a transformed tile before its source must be requested", async () => {
    stored.set("__conversion_revision__", "older-conversion");
    stored.set("stale-tile", { positions: new Float32Array() });
    const cache = createProjectedTerrainGeometryCache(
      "https://example.test/terrain",
      [7.15, 51.25],
      undefined
    );
    const geometry = createGeometry();

    expect(await cache.get(tile.id)).toBeNull();
    cache.set(tile, geometry, reliefVertexMask);
    const boxScan = vi.spyOn(BufferGeometry.prototype, "computeBoundingBox");
    const sphereScan = vi.spyOn(
      BufferGeometry.prototype,
      "computeBoundingSphere"
    );
    const restored = await cache.get(tile.id);
    expect(boxScan).not.toHaveBeenCalled();
    expect(sphereScan).not.toHaveBeenCalled();
    expect(restored?.geometry?.boundingBox).toEqual(geometry.boundingBox);
    expect(restored?.geometry?.boundingSphere).toEqual(geometry.boundingSphere);
    boxScan.mockRestore();
    sphereScan.mockRestore();

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
        restored!.geometry!.getAttribute("normal"),
        0
      ).y
    ).toBeGreaterThan(0);

    const otherSource = createProjectedTerrainGeometryCache(
      "https://example.test/other-terrain",
      [7.15, 51.25],
      undefined
    );
    expect(await otherSource.get(tile.id)).toBeNull();

    geometry.dispose();
    restored?.geometry?.dispose();
  });

  it("owns IndexedDB read arrays without changing persisted data or later reads", async () => {
    const cache = createProjectedTerrainGeometryCache(
      "terrain",
      [7.15, 51.25],
      undefined
    );
    const geometry = createGeometry();
    cache.set(tile, geometry, reliefVertexMask);
    const first = (await cache.get(tile.id))!;
    const adapterResult = (await storage.getItem.mock.results.at(-1)!
      .value) as {
      tile: typeof tile;
      reliefVertexMask: Uint8Array;
      geometry: {
        positions: Float32Array;
        normals: Float32Array;
        indices: Uint32Array;
      };
    };
    expect(first.tile).toBe(adapterResult.tile);
    expect(first.reliefVertexMask).toBe(adapterResult.reliefVertexMask);
    expect(first.geometry!.getAttribute("position").array).toBe(
      adapterResult.geometry!.positions
    );
    expect(first.geometry!.getAttribute("normal").array).toBe(
      adapterResult.geometry!.normals
    );
    expect(first.geometry!.getIndex()!.array).toBe(
      adapterResult.geometry!.indices
    );
    const persisted = structuredClone([...stored.entries()]);

    first.tile.heightMeters[0] = -500;
    first.reliefVertexMask[0] = 0;
    first.tile.indices[0] = 2;
    first.geometry!.getAttribute("position").setX(0, 100);
    first.geometry!.getAttribute("normal").setY(0, -1);
    first.geometry!.getIndex()!.setX(0, 2);
    first.geometry!.boundingBox!.min.x = -100;
    const second = (await cache.get(tile.id))!;

    expect([...stored.entries()]).toEqual(persisted);
    expect(second.tile.heightMeters).toEqual(tile.heightMeters);
    expect(second.reliefVertexMask).toEqual(reliefVertexMask);
    expect(second.tile.indices).toEqual(tile.indices);
    expect(second.geometry!.getAttribute("position").array).toEqual(
      geometry.getAttribute("position").array
    );
    expect(second.geometry!.getAttribute("normal").array).toEqual(
      geometry.getAttribute("normal").array
    );
    expect([...second.geometry!.getIndex()!.array]).toEqual([
      ...geometry!.getIndex()!.array,
    ]);
    expect(second.geometry!.boundingBox).toEqual(geometry.boundingBox);
    expect(second.tile.heightMeters.buffer).not.toBe(
      first.tile.heightMeters.buffer
    );
    geometry.dispose();
    first.geometry!.dispose();
    second.geometry!.dispose();
  });

  it("keeps defensive copies for adapters without IndexedDB read ownership", async () => {
    storage.driver.mockReturnValue("custom-reference-storage");
    storage.getItem.mockImplementation(async (key) => stored.get(key) ?? null);
    const cache = createProjectedTerrainGeometryCache(
      "terrain",
      [7.15, 51.25],
      undefined
    );
    const geometry = createGeometry();
    cache.set(tile, geometry, reliefVertexMask);
    const first = (await cache.get(tile.id))!;
    first.tile.heightMeters[0] = -500;
    first.reliefVertexMask[0] = 0;
    first.geometry!.getAttribute("position").setX(0, 100);
    const second = (await cache.get(tile.id))!;
    expect(second.tile.heightMeters).toEqual(tile.heightMeters);
    expect(second.reliefVertexMask).toEqual(reliefVertexMask);
    expect(second.geometry!.getAttribute("position").getX(0)).toBe(0);
    geometry.dispose();
    first.geometry!.dispose();
    second.geometry!.dispose();
  });

  it("deduplicates pending keys across cache instances before copying geometry", async () => {
    const cache = createProjectedTerrainGeometryCache(
      "terrain",
      [7.15, 51.25],
      undefined
    );
    const sameCache = createProjectedTerrainGeometryCache(
      "terrain",
      [7.15, 51.25],
      undefined
    );
    await cache.get(tile.id);
    let finishWrite!: () => void;
    const gate = new Promise<void>((resolve) => {
      finishWrite = resolve;
    });
    storage.setItem.mockImplementation(async (key, value) => {
      const snapshot = structuredClone(value);
      await gate;
      stored.set(key, snapshot);
      return value;
    });
    const geometry = createGeometry();
    cache.set(tile, geometry, reliefVertexMask);
    geometry.getAttribute("position").setX(0, 100);
    const copies = vi.spyOn(Float32Array, "from");
    sameCache.set(tile, geometry, reliefVertexMask);
    expect(copies).not.toHaveBeenCalled();
    copies.mockRestore();
    const read = sameCache.get(tile.id);
    await Promise.resolve();
    expect(storage.setItem).toHaveBeenCalledOnce();
    finishWrite();
    const restored = (await read)!;
    expect(restored.geometry!.getAttribute("position").getX(0)).toBe(0);
    geometry.dispose();
    restored.geometry!.dispose();
  });

  it("bounds pending array bytes across namespaces and admits writes after completion", async () => {
    const caches = ["first", "second", "third"].map((source) =>
      createProjectedTerrainGeometryCache(source, [7.15, 51.25], undefined)
    );
    await caches[0].get(tile.id);
    let finishWrites!: () => void;
    const gate = new Promise<void>((resolve) => {
      finishWrites = resolve;
    });
    storage.setItem.mockImplementation(async (key, value) => {
      const snapshot = structuredClone(value);
      await gate;
      stored.set(key, snapshot);
      return value;
    });
    const geometry = createGeometry();
    // Each geometry snapshot owns 12 MiB, plus its small index/source arrays.
    for (const attribute of ["position", "normal"]) {
      geometry.setAttribute(
        attribute,
        new BufferAttribute(new Float32Array(3 * 512 * 1024), 3)
      );
    }
    caches[0].set(tile, geometry, reliefVertexMask);
    caches[1].set(tile, geometry, reliefVertexMask);
    const copies = vi.spyOn(Float32Array, "from");
    caches[2].set(tile, geometry, reliefVertexMask);
    expect(copies).not.toHaveBeenCalled();
    copies.mockRestore();
    await Promise.resolve();
    expect(storage.setItem).toHaveBeenCalledTimes(2);
    expect(await caches[2].get(tile.id)).toBeNull();

    finishWrites();
    for (const cache of caches.slice(0, 2)) {
      (await cache.get(tile.id))!.geometry!.dispose();
    }
    caches[2].set(tile, geometry, reliefVertexMask);
    const restored = await caches[2].get(tile.id);
    expect(restored).not.toBeNull();
    expect(storage.setItem).toHaveBeenCalledTimes(3);
    geometry.dispose();
    restored?.geometry?.dispose();
  });

  it("disables optional persistence after a quota failure without rejecting readers", async () => {
    const cache = createProjectedTerrainGeometryCache(
      "terrain",
      [7.15, 51.25],
      undefined
    );
    await cache.get(tile.id);
    storage.setItem.mockRejectedValueOnce(
      new DOMException("Storage quota exhausted", "QuotaExceededError")
    );
    const geometry = createGeometry();
    expect(cache.set(tile, geometry, reliefVertexMask)).toBeUndefined();
    expect(await cache.get(tile.id)).toBeNull();
    const copies = vi.spyOn(Float32Array, "from");
    cache.set(
      { ...tile, id: { ...tile.id, x: tile.id.x + 1 } },
      geometry,
      reliefVertexMask
    );
    expect(copies).not.toHaveBeenCalled();
    expect(storage.setItem).toHaveBeenCalledOnce();
    geometry.dispose();
  });

  it("caches entirely missing relief without projecting it and isolates NoData policies", async () => {
    const cache = createProjectedTerrainGeometryCache(
      "terrain",
      [7.15, 51.25],
      -32768
    );
    const otherPolicy = createProjectedTerrainGeometryCache(
      "terrain",
      [7.15, 51.25],
      undefined
    );
    const missing = new Uint8Array(tile.u.length);
    cache.set(tile, null, missing);
    missing.fill(1);
    const restored = (await cache.get(tile.id))!;
    expect(restored.geometry).toBeNull();
    expect(restored.reliefVertexMask).toEqual(new Uint8Array(tile.u.length));
    expect(await otherPolicy.get(tile.id)).toBeNull();
  });

  it("keeps scene origins isolated after rejecting slower exact-reprojection caching", async () => {
    const cache = createProjectedTerrainGeometryCache(
      "terrain",
      [7.15, 51.25],
      undefined
    );
    const otherOrigin = createProjectedTerrainGeometryCache(
      "terrain",
      [7.2, 51.3],
      undefined
    );
    const geometry = createGeometry();
    cache.set(tile, geometry, reliefVertexMask);
    expect(await otherOrigin.get(tile.id)).toBeNull();
    const retained = await cache.get(tile.id);
    expect(retained).not.toBeNull();
    geometry.dispose();
    retained?.geometry?.dispose();
  });
});
