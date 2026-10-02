import { describe, expect, it } from "vitest";
import {
  createRasterDemTerrainBaseCoverage,
  createRasterDemTerrainBaseCache,
} from "./raster-dem-terrain-base-coverage";
import { BufferGeometry } from "three";
import type { TerrainTile } from "../../core/raster-dem-tile";
import { terrainTileKey } from "../../core/raster-dem-tile";
import { TerrainMemoryDeferredError } from "../../core/terrain-memory-admission";

const stages = [0, 1, 2].map((level) => ({
  level,
  rasterEdgePixels: 512 * 2 ** level,
  ids: Array.from({ length: 4 ** level }, (_, i) => ({
    level,
    x: i % 2 ** level,
    y: Math.floor(i / 2 ** level),
  })),
}));

const fixture = (budget = 50, stored = true) => {
  const buffers = new Map<string, number>();
  const requested: string[] = [];
  const coverage = createRasterDemTerrainBaseCoverage({
    stages,
    memoryBudgetBytes: budget,
    bytes: (id) => buffers.get(terrainTileKey(id)) ?? null,
    prepare: async (id) => {
      const key = terrainTileKey(id);
      requested.push(key);
      buffers.set(key, 10);
      return true;
    },
    persist: async () => stored,
    release: (id) => buffers.delete(terrainTileKey(id)),
    trim: () => {},
  });
  return { coverage, requested, buffers };
};

describe("terrain baseline reserve", () => {
  it("retries interrupted baseline protection without losing RAM fallback or reloading the final tile", async () => {
    const controller = new AbortController();
    const buffers = new Map<string, number>();
    let loads = 0;
    let confirmations = 0;
    const coverage = createRasterDemTerrainBaseCoverage({
      stages: [stages[0]],
      memoryBudgetBytes: 10,
      bytes: (id) => buffers.get(terrainTileKey(id)) ?? null,
      prepare: async (id) => {
        loads++;
        buffers.set(terrainTileKey(id), 10);
        return true;
      },
      persist: async () => true,
      confirmPersistedStage: async () => {
        if (++confirmations === 1) {
          controller.abort();
          return false;
        }
        return true;
      },
      release: (id) => buffers.delete(terrainTileKey(id)),
      trim: () => {},
    });
    expect(await coverage.run(controller.signal, () => true)).toBe(1);
    expect(coverage.snapshot()).toMatchObject({
      remaining: 1,
      pinnedTiles: 1,
      residentBytes: 10,
    });
    expect(buffers.size).toBe(1);
    expect(await coverage.run(new AbortController().signal, () => true)).toBe(
      0
    );
    expect(loads).toBe(1);
    expect(confirmations).toBe(2);
    expect(coverage.snapshot()).toMatchObject({
      remaining: 0,
      residentLevel: 0,
      pinnedTiles: 1,
    });
    expect(coverage.snapshot().stages[0].persisted).toBe(true);
  });
  it("finishes coarse stages first and retains only complete budget-fitting cuts", async () => {
    const { coverage, requested, buffers } = fixture();
    expect(await coverage.run(new AbortController().signal, () => true)).toBe(
      21
    );
    expect(requested.map((key) => Number(key.split("/")[0]))).toEqual([
      0,
      1,
      1,
      1,
      1,
      ...Array(16).fill(2),
    ]);
    expect(coverage.snapshot()).toMatchObject({
      residentBytes: 50,
      pinnedTiles: 5,
      residentLevel: 1,
      remaining: 0,
    });
    expect(coverage.snapshot().stages.map(({ resident }) => resident)).toEqual([
      true,
      true,
      false,
    ]);
    expect(buffers.size).toBe(5);
  });

  it("keeps the completed fallback when storage cannot hold a finer cut", async () => {
    const { coverage, buffers, requested } = fixture(10, false);
    await coverage.run(new AbortController().signal, () => true);
    expect(coverage.snapshot()).toMatchObject({
      residentLevel: 0,
      residentBytes: 10,
      storageBlocked: true,
    });
    expect(buffers.size).toBe(1);
    expect(requested).toHaveLength(2);
    expect(await coverage.run(new AbortController().signal, () => true)).toBe(
      0
    );
  });

  it("resumes an interrupted stage without losing or recounting prepared tiles", async () => {
    const { coverage, requested } = fixture();
    await coverage.run(
      new AbortController().signal,
      () => requested.length < 3
    );
    await coverage.run(new AbortController().signal, () => true);
    expect(coverage.snapshot()).toMatchObject({
      residentBytes: 50,
      pinnedTiles: 5,
      remaining: 0,
    });
    expect(coverage.snapshot().stages).toHaveLength(3);
  });

  it("adjusts complete fallback residency when the shared grant changes", async () => {
    const { coverage, buffers } = fixture();
    await coverage.run(new AbortController().signal, () => true);
    coverage.setMemoryBudget(10);
    expect(coverage.snapshot()).toMatchObject({
      residentLevel: 0,
      residentBytes: 10,
      pinnedTiles: 1,
    });
    expect(buffers.size).toBe(1);
    coverage.setMemoryBudget(210);
    await coverage.run(new AbortController().signal, () => true);
    expect(coverage.snapshot()).toMatchObject({
      residentLevel: 2,
      residentBytes: 210,
      pinnedTiles: 21,
    });
  });

  it("persists refused RAM installs once without certifying missing baseline geometry", async () => {
    const resident = new Set<string>();
    let loads = 0;
    let disposed = 0;
    const coverage = createRasterDemTerrainBaseCache({
      stages: stages.slice(0, 2),
      memoryBudgetBytes: 50,
      bytes: (id) => (resident.has(terrainTileKey(id)) ? 10 : null),
      load: async (id) => {
        loads++;
        const geometry = new BufferGeometry();
        geometry.addEventListener("dispose", () => disposed++);
        return {
          tile: { id } as TerrainTile,
          projectedGeometry: geometry,
          reliefVertexMask: new Uint8Array(),
          cachedEcefGeometry: null,
        };
      },
      persistPrepared: async () => true,
      install: (_, id) => {
        if (id.level > 0) throw new TerrainMemoryDeferredError(10);
        resident.add(terrainTileKey(id));
      },
      isDisposed: () => false,
      release: (id) => {
        resident.delete(terrainTileKey(id));
      },
      trim: () => {},
    });
    await coverage.run(new AbortController().signal, () => true);
    expect(coverage.snapshot()).toMatchObject({
      residentLevel: 0,
      residentBytes: 10,
      pinnedTiles: 1,
      remaining: 0,
      stages: [
        { level: 0, resident: true, persisted: true, bytes: 10 },
        { level: 1, resident: false, persisted: true, bytes: 40 },
      ],
    });
    expect(disposed).toBe(4);
    await coverage.run(new AbortController().signal, () => true);
    expect(loads).toBe(5);
    expect(resident.size).toBe(1);
  });

  it("releases aborted optional writes and stops confirmed unavailable source retries", async () => {
    const controller = new AbortController();
    const geometry = new BufferGeometry();
    let disposed = false;
    geometry.addEventListener("dispose", () => {
      disposed = true;
    });
    let attempts = 0;
    const coverage = createRasterDemTerrainBaseCache({
      stages,
      memoryBudgetBytes: 50,
      bytes: () => 10,
      load: async () => {
        if (++attempts > 1) throw new Error("missing");
        return {
          tile: { id: stages[0].ids[0] } as TerrainTile,
          projectedGeometry: geometry,
          reliefVertexMask: new Uint8Array(),
          cachedEcefGeometry: null,
        };
      },
      persistPrepared: () => {
        controller.abort();
        return new Promise(() => {});
      },
      install: () => {
        throw new Error("aborted geometry must not publish");
      },
      isDisposed: () => false,
      isUnavailable: () => true,
      release: () => {},
      trim: () => {},
    });
    await coverage.run(controller.signal, () => true);
    expect(disposed).toBe(true);
    await coverage.run(new AbortController().signal, () => true);
    expect(coverage.snapshot()).toMatchObject({
      unavailableTile: stages[0].ids[0],
      running: false,
      remaining: 0,
    });
    await coverage.run(new AbortController().signal, () => true);
    expect(attempts).toBe(2);
  });
});
