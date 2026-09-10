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
      updateCosts: vi.fn(
        async (_key: string, _costs: { restoreMs: number }) => true
      ),
    },
  };
});

vi.mock("@carma-commons/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@carma-commons/utils")>()),
  createDerivedBufferCache: () => ({
    register: () => ({
      get: async (key: string) => {
        const value = await storage.getItem(key);
        return value === null ? null : { value, metadata: {} };
      },
      put: async (key: string, value: unknown) => {
        try {
          await storage.setItem(key, value);
          return true;
        } catch {
          return false;
        }
      },
      updateCosts: storage.updateCosts,
    }),
  }),
}));

// This suite owns main-thread restoration, dispatch and byte accounting. Codec
// selection/admission has its own strategy tests; keep records as typed buffers
// here so the fixture does not benchmark Blob codecs or require native storage.
vi.mock("./projected-terrain-cache-strategy", () => ({
  createProjectedTerrainCacheStrategy: () => ({
    canWrite: () => true,
    encode: async (entry: unknown, bytes: number) => ({
      payload: entry,
      bytes,
    }),
    decode: async (entry: unknown) => entry ?? null,
    updateCosts: (key: string, restoreMs: number) =>
      storage.updateCosts(key, { restoreMs }),
    dispose: () => {},
  }),
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
    vi.stubEnv("PROD", true);
    vi.stubGlobal("location", {
      href: "https://fixture.test/assets/terrain.worker-a1b2c3d4.js",
    });
    vi.resetModules();
    stored.clear();
    storage.clear.mockClear();
    storage.updateCosts.mockReset().mockResolvedValue(true);
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
    const module = await import("./projected-terrain-geometry-cache");
    // Headless execution dynamically imports the entire worker dependency
    // graph. Exclude test-runner module transforms from these fast-path fixtures.
    await import("./terrain-worker-task");
    PROJECTED_TERRAIN_GEOMETRY_CACHE_REVISION =
      module.PROJECTED_TERRAIN_GEOMETRY_CACHE_REVISION;
    createProjectedTerrainGeometryCache = (
      source,
      origin,
      noData,
      producerAssetUrl = "https://fixture.test/assets/terrain-main-a1b2c3d4.js"
    ) =>
      module.createProjectedTerrainGeometryCache(
        source,
        origin,
        noData,
        producerAssetUrl
      );
    stored.set(
      "__conversion_revision__",
      PROJECTED_TERRAIN_GEOMETRY_CACHE_REVISION
    );
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("adopts a fast read and clears its deadline without disabling the cache", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const worker = await import("./terrain-worker-client");
    const dispatch = vi
      .spyOn(worker, "runTerrainWorkerTask")
      .mockImplementation(async (task) => {
        if (task.kind === "read-cache") {
          await new Promise((resolve) => setTimeout(resolve, 49));
          return {
            kind: "read-cache",
            entry: { tile, geometry: null, reliefVertexMask },
          };
        }
        return { kind: "cache-cost", updated: true };
      });
    const cache = createProjectedTerrainGeometryCache(
      "fast",
      [7, 51],
      undefined
    );
    const read = cache.get(tile.id);
    await vi.advanceTimersByTimeAsync(49);
    expect(await read).toMatchObject({ tile });
    expect(dispatch.mock.calls[0][1]?.aborted).toBe(false);
    expect(dispatch.mock.calls[1][0]).toMatchObject({
      kind: "cache-cost",
      restoreMs: 49,
    });
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(100);
    const next = cache.get(tile.id);
    await vi.advanceTimersByTimeAsync(49);
    expect(await next).not.toBeNull();
  });

  it("does not reuse a looser projected mesh for a stricter residual request", async () => {
    const cache = createProjectedTerrainGeometryCache(
      "error-variants",
      [7, 51],
      undefined
    );
    const coarse = {
      ...tile,
      maximumMeshErrorMeters: 0.01,
      reconstructionErrorMeters: 0.009,
      rasterStride: 4 as const,
    };
    cache.set(coarse, null, reliefVertexMask);
    expect((await cache.get(tile.id))?.tile.maximumMeshErrorMeters).toBe(0.01);
    expect(await cache.get(tile.id, 0.005)).toBeNull();
    const fine = {
      ...tile,
      maximumMeshErrorMeters: 0.005,
      reconstructionErrorMeters: 0.004,
      rasterStride: 2 as const,
    };
    cache.set(fine, null, reliefVertexMask);
    expect((await cache.get(tile.id, 0.009))?.tile.maximumMeshErrorMeters).toBe(
      0.005
    );
    expect((await cache.get(tile.id))?.tile.rasterStride).toBe(4);
  });

  it("times out a hanging read at 50 ms, rejects late adoption and opens the session circuit", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const worker = await import("./terrain-worker-client");
    let finishRead!: (
      value: Awaited<ReturnType<typeof worker.runTerrainWorkerTask>>
    ) => void;
    const dispatch = vi
      .spyOn(worker, "runTerrainWorkerTask")
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            finishRead = resolve;
          })
      );
    const cache = createProjectedTerrainGeometryCache(
      "slow",
      [7, 51],
      undefined
    );
    const settled = vi.fn();
    const read = cache.get(tile.id).then((value) => {
      settled(value);
      return value;
    });
    await vi.advanceTimersByTimeAsync(49);
    expect(settled).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(await read).toBeNull();
    expect(dispatch.mock.calls[0][1]?.aborted).toBe(true);
    expect(dispatch.mock.calls[0][1]?.reason).toMatchObject({
      name: "TimeoutError",
    });
    // This mock deliberately ignores abort, like a native completion already
    // posted before termination. The read must not adopt it or emit feedback.
    finishRead({
      kind: "read-cache",
      entry: { tile, geometry: null, reliefVertexMask },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toHaveBeenCalledOnce();
    expect(settled).toHaveBeenCalledWith(null);
    const anotherCache = createProjectedTerrainGeometryCache(
      "other",
      [7, 51],
      undefined
    );
    expect(await anotherCache.get(tile.id)).toBeNull();
    const copies = vi.spyOn(Uint8Array, "from");
    anotherCache.set(tile, null, reliefVertexMask);
    expect(copies).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("includes a pending write in the same 50 ms deadline and aborts optional work", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const worker = await import("./terrain-worker-client");
    const dispatch = vi
      .spyOn(worker, "runTerrainWorkerTask")
      .mockImplementation(
        (_task, signal) =>
          new Promise((_resolve, reject) =>
            signal?.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            })
          )
      );
    const cache = createProjectedTerrainGeometryCache(
      "slow-write",
      [7, 51],
      undefined
    );
    cache.set(tile, null, reliefVertexMask);
    const read = cache.get(tile.id);
    await vi.advanceTimersByTimeAsync(50);
    expect(await read).toBeNull();
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls[0][0].kind).toBe("write-cache");
    expect(dispatch.mock.calls[0][1]?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not restart the deadline after waiting for a same-key write", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const worker = await import("./terrain-worker-client");
    const dispatch = vi
      .spyOn(worker, "runTerrainWorkerTask")
      .mockImplementation(async (task) => {
        if (task.kind === "write-cache") {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return { kind: "write-cache", stored: true };
        }
        return new Promise(() => {});
      });
    const cache = createProjectedTerrainGeometryCache(
      "write-then-slow-read",
      [7, 51],
      undefined
    );
    cache.set(tile, null, reliefVertexMask);
    const read = cache.get(tile.id);
    await vi.advanceTimersByTimeAsync(49);
    expect(dispatch.mock.calls.map(([task]) => task.kind)).toEqual([
      "write-cache",
      "read-cache",
    ]);
    expect(dispatch.mock.calls[1][1]?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await read).toBeNull();
    expect(dispatch.mock.calls[1][1]?.aborted).toBe(true);
  });

  it("rejects an over-budget completion even before a delayed timer callback runs", async () => {
    const worker = await import("./terrain-worker-client");
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    const dispatch = vi
      .spyOn(worker, "runTerrainWorkerTask")
      .mockImplementation(async () => {
        clock.mockReturnValue(51);
        return {
          kind: "read-cache",
          entry: { tile, geometry: null, reliefVertexMask },
        };
      });
    const cache = createProjectedTerrainGeometryCache(
      "late-main-task",
      [7, 51],
      undefined
    );
    expect(await cache.get(tile.id)).toBeNull();
    expect(await cache.get(tile.id)).toBeNull();
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("treats an unavailable backend as a miss without banning a later fast read", async () => {
    const worker = await import("./terrain-worker-client");
    const dispatch = vi
      .spyOn(worker, "runTerrainWorkerTask")
      .mockRejectedValueOnce(
        new DOMException("Storage unavailable", "SecurityError")
      )
      .mockResolvedValue({
        kind: "read-cache",
        entry: { tile, geometry: null, reliefVertexMask },
      });
    const cache = createProjectedTerrainGeometryCache(
      "unavailable",
      [7, 51],
      undefined
    );
    expect(await cache.get(tile.id)).toBeNull();
    expect(await cache.get(tile.id)).not.toBeNull();
    expect(dispatch.mock.calls.map(([task]) => task.kind)).toEqual([
      "read-cache",
      "read-cache",
      "cache-cost",
    ]);
  });

  it("aborts sibling reads and pending cost feedback when the first read exceeds its deadline", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const worker = await import("./terrain-worker-client");
    const dispatch = vi
      .spyOn(worker, "runTerrainWorkerTask")
      .mockResolvedValueOnce({
        kind: "read-cache",
        entry: { tile, geometry: null, reliefVertexMask },
      })
      .mockImplementation(
        (_task, signal) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
          })
      );
    const cache = createProjectedTerrainGeometryCache(
      "siblings",
      [7, 51],
      undefined
    );
    expect(await cache.get(tile.id)).not.toBeNull();
    const first = cache.get(tile.id);
    await vi.advanceTimersByTimeAsync(20);
    const second = cache.get({ ...tile.id, x: tile.id.x + 1 });
    await vi.advanceTimersByTimeAsync(30);
    expect(await Promise.all([first, second])).toEqual([null, null]);
    expect(dispatch.mock.calls.map(([task]) => task.kind)).toEqual([
      "read-cache",
      "cache-cost",
      "read-cache",
      "read-cache",
    ]);
    expect(
      dispatch.mock.calls.slice(1).every(([, signal]) => signal?.aborted)
    ).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not restore, copy or persist buffers from an unversioned HMR graph", async () => {
    vi.stubEnv("PROD", false);
    const cache = createProjectedTerrainGeometryCache(
      "dev",
      [7, 51],
      undefined
    );
    const geometry = createGeometry();
    cache.set(tile, geometry, reliefVertexMask, 100);
    expect(await cache.get(tile.id)).toBeNull();
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    geometry.dispose();
  });

  it("emits cost feedback with only one real read per cache instance", async () => {
    const worker = await import("./terrain-worker-client");
    const dispatch = vi.spyOn(worker, "runTerrainWorkerTask");
    const caches = Array.from({ length: 3 }, () =>
      createProjectedTerrainGeometryCache(
        "terrain-reload-cost",
        [7.15, 51.25],
        undefined
      )
    );
    const geometry = createGeometry();
    caches[0].set(tile, geometry, reliefVertexMask, 100);
    for (const cache of caches) {
      const restored = await cache.get(tile.id);
      expect(restored).not.toBeNull();
      restored?.geometry?.dispose();
    }
    const feedback = dispatch.mock.calls.flatMap(([task], index) =>
      task.kind === "cache-cost"
        ? [{ task, result: dispatch.mock.results[index].value }]
        : []
    );
    expect(feedback).toHaveLength(3);
    expect(new Set(feedback.map(({ task }) => task.key)).size).toBe(1);
    expect(
      feedback.every(
        ({ task }) => Number.isFinite(task.restoreMs) && task.restoreMs >= 0
      )
    ).toBe(true);
    await Promise.all(feedback.map(({ result }) => result));
    expect(storage.updateCosts).toHaveBeenCalledTimes(3);
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(
      dispatch.mock.calls
        .map(([task]) => task.kind)
        .filter(
          (kind) =>
            kind !== "write-cache" &&
            kind !== "read-cache" &&
            kind !== "cache-cost"
        )
    ).toEqual([]);
    geometry.dispose();
  });

  it("refines real restore measurements using at most five recent samples", async () => {
    const worker = await import("./terrain-worker-client");
    const dispatch = vi
      .spyOn(worker, "runTerrainWorkerTask")
      .mockImplementation(async (task) => {
        if (task.kind === "read-cache")
          return {
            kind: "read-cache",
            entry: { tile, geometry: null, reliefVertexMask },
          };
        if (task.kind === "cache-cost")
          return { kind: "cache-cost", updated: true };
        throw new Error(`Unexpected task: ${task.kind}`);
      });
    const clock = vi.spyOn(performance, "now");
    const cache = createProjectedTerrainGeometryCache(
      "terrain-cost-median",
      [7.15, 51.25],
      undefined
    );
    for (const duration of [1, 2, 3, 10, 11, 12, 13]) {
      clock.mockReturnValueOnce(1000).mockReturnValueOnce(1000 + duration);
      expect(await cache.get(tile.id)).not.toBeNull();
    }
    expect(
      dispatch.mock.calls.flatMap(([task]) =>
        task.kind === "cache-cost" ? [task.restoreMs] : []
      )
    ).toEqual([1, 2, 2, 3, 3, 10, 11]);
  });

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
    expect(dispatch).toHaveBeenCalledWith(
      {
        kind: "read-cache",
        key: expect.any(String),
        producerAssetUrl:
          "https://fixture.test/assets/terrain-main-a1b2c3d4.js",
      },
      expect.any(AbortSignal)
    );
    const readIndex = dispatch.mock.calls.findIndex(
      ([task]) => task.kind === "read-cache"
    );
    const result = await dispatch.mock.results[readIndex].value;
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

    // Version-key isolation no longer clears an entire legacy or foreign store.
    expect(storage.clear).not.toHaveBeenCalled();
    expect(stored.has("stale-tile")).toBe(true);
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

  it("uses only native read ownership without a localStorage adapter", async () => {
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
    let startedWrite!: () => void;
    const writeStarted = new Promise<void>((resolve) => {
      startedWrite = resolve;
    });
    storage.setItem.mockImplementation(async (key, value) => {
      const snapshot = structuredClone(value);
      startedWrite();
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
    await writeStarted;
    expect(storage.setItem).toHaveBeenCalledOnce();
    finishWrite();
    const restored = (await read)!;
    expect(restored.geometry!.getAttribute("position").getX(0)).toBe(0);
    geometry.dispose();
    restored.geometry!.dispose();
  });

  it("counts a shared source backing once while charging compact mask and geometry snapshots", async () => {
    const worker = await import("./terrain-worker-client");
    const dispatch = vi.spyOn(worker, "runTerrainWorkerTask");
    const backing = new ArrayBuffer(4 * 1024 ** 2);
    const sharedTile = {
      ...tile,
      u: new Float32Array(backing, 0, 3),
      v: new Float32Array(backing, 12, 3),
      heightMeters: new Float32Array(backing, 24, 3),
      indices: new Uint32Array(backing, 36, 3),
      westIndices: new Uint32Array(backing, 48, 0),
      southIndices: new Uint32Array(backing, 48, 0),
      eastIndices: new Uint32Array(backing, 48, 0),
      northIndices: new Uint32Array(backing, 48, 0),
    };
    sharedTile.u.set(tile.u);
    sharedTile.v.set(tile.v);
    sharedTile.heightMeters.set(tile.heightMeters);
    sharedTile.indices.set(tile.indices);
    const sharedMask = new Uint8Array(backing, 64, reliefVertexMask.length);
    sharedMask.set(reliefVertexMask);
    const geometry = createGeometry();
    const cache = createProjectedTerrainGeometryCache(
      "shared-blob-backing",
      [7.15, 51.25],
      undefined
    );
    cache.set(sharedTile, geometry, sharedMask);
    const restored = await cache.get(tile.id);
    expect(restored).not.toBeNull();
    const write = dispatch.mock.calls
      .map(([task]) => task)
      .find((task) => task.kind === "write-cache");
    if (!write || write.kind !== "write-cache")
      throw Error("Expected shared-backing write admission");
    const snapshot = write.entry.geometry!;
    expect(write.bytes).toBe(
      backing.byteLength +
        sharedMask.byteLength +
        snapshot.positions.byteLength +
        snapshot.normals.byteLength +
        snapshot.indices.byteLength
    );
    expect(write.entry.reliefVertexMask.buffer.byteLength).toBe(
      sharedMask.byteLength
    );
    expect(write.entry.reliefVertexMask.buffer).not.toBe(backing);
    expect(snapshot.positions.buffer).not.toBe(backing);
    expect(snapshot.indices.buffer).not.toBe(backing);
    // Eight views into 4 MiB must not falsely consume the whole 32 MiB budget.
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(restored?.tile.heightMeters).toEqual(tile.heightMeters);
    expect(backing.byteLength).toBe(4 * 1024 ** 2);
    geometry.dispose();
    restored?.geometry?.dispose();
  });

  it("bounds pending array bytes across namespaces and admits writes after completion", async () => {
    // Byte accounting only: the 12 MiB fixtures are cloned three times per
    // write, so a real clock would let the 50 ms read deadline fire under load.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
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
    await vi.waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(2));
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

  it("a failed optional write does not disable subsequent writes or cache readers", async () => {
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
    expect(copies).toHaveBeenCalled();
    const recovered = await cache.get({ ...tile.id, x: tile.id.x + 1 });
    expect(recovered).not.toBeNull();
    expect(storage.setItem).toHaveBeenCalledTimes(2);
    recovered?.geometry?.dispose();
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
