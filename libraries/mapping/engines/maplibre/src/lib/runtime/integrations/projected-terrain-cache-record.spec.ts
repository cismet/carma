// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CachedProjectedTerrainTile } from "./projected-terrain-cache-record";
import { decodeTerrainHeightMetadata } from "../../core/terrain-height-metadata";

const mocks = vi.hoisted(() => ({
  manager: vi.fn((_options: unknown) => {
    const values = new Map<string, unknown>();
    const records = {
      get: vi.fn(async (key: string) => {
        const value = values.get(key);
        return value === undefined ? null : { value };
      }),
      put: vi.fn(async (key: string, value: unknown, _costs: unknown) => {
        values.set(key, value);
        return true;
      }),
      updateCosts: vi.fn(async () => true),
    };
    return {
      register: vi.fn(() => records),
      cleanupObsoleteEpochs: vi.fn(async () => 0),
      close: vi.fn(),
    };
  }),
  strategy: vi.fn((_manager: unknown) => ({
    canWrite: vi.fn(() => true),
    updateCosts: vi.fn(async () => true),
    dispose: vi.fn(),
    decode: vi.fn(async (value: unknown) => value ?? null),
    encode: vi.fn(async (entry: unknown, bytes: number) => ({ payload: entry, bytes })),
    calibrate: vi.fn(async () => true),
  })),
}));

vi.mock("@carma-commons/utils", async (importOriginal) => ({
  ...await importOriginal<typeof import("@carma-commons/utils")>(),
  createDerivedBufferCache: mocks.manager,
}));
vi.mock("./projected-terrain-cache-strategy", () => ({
  createProjectedTerrainCacheStrategy: mocks.strategy,
}));

const WORKER_URL = "https://terrain.test/assets/terrain.worker-w1234567.js";
const mainUrl = (name = "a") => `https://terrain.test/assets/runtime-${name}1234567.js`;
const entry: CachedProjectedTerrainTile = {
  tile: {
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
    geometricErrorMeters: 10,
    byteLength: 60,
  },
  geometry: null,
  reliefVertexMask: new Uint8Array([1, 1, 1]),
};

describe("projected terrain combined producer epoch", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("PROD", true);
    vi.stubGlobal("document", undefined);
    vi.stubGlobal("location", { href: WORKER_URL });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([
    undefined,
    "",
    "/assets/runtime-a1234567.js",
    "https://terrain.test/src/runtime.ts",
    "https://terrain.test/assets/runtime-a1234567.js?t=1",
  ])("does no storage or codec work for an invalid main producer: %s", async (producer) => {
    const cache = await import("./projected-terrain-cache-record");
    expect(await cache.readProjectedTerrainCacheRecord("tile", producer)).toBeNull();
    expect(await cache.writeProjectedTerrainCacheRecord("tile", entry, 60, 10, producer)).toBe(false);
    expect(await cache.updateProjectedTerrainReadCost("tile", 2, producer)).toBe(false);
    expect(await cache.calibrateProjectedTerrainCache(producer)).toBe(false);
    expect(mocks.manager).not.toHaveBeenCalled();
    expect(mocks.strategy).not.toHaveBeenCalled();
  });

  it("fails closed for an unbundled worker even with a valid main producer", async () => {
    vi.stubGlobal("location", { href: "https://terrain.test/src/terrain.worker.ts" });
    const cache = await import("./projected-terrain-cache-record");
    expect(await cache.readProjectedTerrainCacheRecord("tile", mainUrl())).toBeNull();
    expect(await cache.writeProjectedTerrainCacheRecord("tile", entry, 60, 10, mainUrl())).toBe(false);
    expect(mocks.manager).not.toHaveBeenCalled();
  });

  it("fails closed in development and on the main thread", async () => {
    vi.stubEnv("PROD", false);
    let cache = await import("./projected-terrain-cache-record");
    expect(await cache.readProjectedTerrainCacheRecord("tile", mainUrl())).toBeNull();
    vi.stubEnv("PROD", true);
    vi.stubGlobal("document", {});
    vi.resetModules();
    cache = await import("./projected-terrain-cache-record");
    expect(await cache.readProjectedTerrainCacheRecord("tile", mainUrl())).toBeNull();
    expect(mocks.manager).not.toHaveBeenCalled();
  });

  it("uses the combined epoch for records, strategy profiles and cleanup", async () => {
    const cache = await import("./projected-terrain-cache-record");
    expect(mocks.manager).not.toHaveBeenCalled();
    expect(await cache.writeProjectedTerrainCacheRecord("tile", entry, 60, 10, mainUrl())).toBe(true);
    expect(await cache.readProjectedTerrainCacheRecord("tile", mainUrl())).toBe(entry);
    expect(await cache.updateProjectedTerrainReadCost("tile", 2, mainUrl())).toBe(true);
    expect(await cache.calibrateProjectedTerrainCache(mainUrl())).toBe(true);
    expect(mocks.manager).toHaveBeenCalledTimes(1);
    expect(mocks.manager).toHaveBeenCalledWith({
      capacityBytes: 256 * 1024 ** 2,
      producerEpoch: JSON.stringify([mainUrl(), WORKER_URL]),
    });
    const manager = mocks.manager.mock.results[0].value;
    expect(manager.register).toHaveBeenCalledWith("terrain-projected", cache.PROJECTED_TERRAIN_GEOMETRY_CACHE_REVISION);
    expect(mocks.strategy).toHaveBeenCalledWith(manager, "terrain-projected", cache.PROJECTED_TERRAIN_GEOMETRY_CACHE_REVISION, cache.isCachedProjectedTerrainTile);
    expect(manager.cleanupObsoleteEpochs).toHaveBeenCalledTimes(1);
    expect(await cache.readProjectedTerrainCacheRecord("tile", mainUrl("b"))).toBeNull();
    expect(mocks.manager).toHaveBeenCalledTimes(2);
  });

  it("closes the least recently used inactive pipeline beyond four identities", async () => {
    const cache = await import("./projected-terrain-cache-record");
    for (const name of ["a", "b", "c", "d", "a", "e"])
      await cache.readProjectedTerrainCacheRecord("tile", mainUrl(name));
    expect(mocks.manager).toHaveBeenCalledTimes(5);
    for (const [index, result] of mocks.manager.mock.results.entries())
      expect(result.value.close).toHaveBeenCalledTimes(index === 1 ? 1 : 0);
  });

  it("merges native height observations under a source lock and isolates sources and producers", async () => {
    const request = vi.fn(async (_name: string, callback: () => Promise<unknown>) => callback());
    vi.stubGlobal("navigator", { locks: { request } });
    const cache = await import("./projected-terrain-cache-record");
    const source = "dem-terrarium/revision-1";
    expect(await cache.writeTerrainHeightMetadata(source, new Float64Array([10, 532, 218, 100, 120]), mainUrl())).toBe(true);
    expect(await cache.writeTerrainHeightMetadata(source, new Float64Array([10, 532, 218, 90, 115]), mainUrl())).toBe(true);
    expect(decodeTerrainHeightMetadata(await cache.readTerrainHeightMetadata(source, mainUrl())).get("10/532/218")).toEqual([90, 120]);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0]).toContain(source);
    expect(await cache.readTerrainHeightMetadata("dem-terrarium/revision-2", mainUrl())).toBeNull();
    expect(await cache.readTerrainHeightMetadata(source, mainUrl("b"))).toBeNull();
    expect(mocks.strategy.mock.results.every(({ value }) => value.encode.mock.calls.length === 0)).toBe(true);
  });

  it("does not write height metadata without cross-worker locking or a valid producer", async () => {
    vi.stubGlobal("navigator", {});
    const cache = await import("./projected-terrain-cache-record");
    const ranges = new Float64Array([10, 532, 218, 100, 120]);
    expect(await cache.writeTerrainHeightMetadata("source", ranges, mainUrl())).toBe(false);
    expect(await cache.readTerrainHeightMetadata("source", mainUrl())).toBeNull();
    expect(await cache.writeTerrainHeightMetadata("source", ranges)).toBe(false);
    expect(await cache.readTerrainHeightMetadata("source")).toBeNull();
  });

  it("does not evict an in-flight pipeline to admit a fifth concurrent identity", async () => {
    const cache = await import("./projected-terrain-cache-record");
    const active = ["a", "b", "c", "d"].map(name =>
      cache.readProjectedTerrainCacheRecord("tile", mainUrl(name))
    );
    expect(await cache.readProjectedTerrainCacheRecord("tile", mainUrl("e"))).toBeNull();
    expect(mocks.manager).toHaveBeenCalledTimes(4);
    for (const result of mocks.manager.mock.results)
      expect(result.value.close).not.toHaveBeenCalled();
    await Promise.all(active);
  });
});
