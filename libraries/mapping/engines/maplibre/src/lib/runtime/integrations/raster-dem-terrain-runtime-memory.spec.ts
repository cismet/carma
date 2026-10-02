import { describe, expect, it, vi } from "vitest";
import {
  createIdlePrefetchFixture,
  installRasterDemTerrainRuntimeFixture,
  registerSharedThreeTerrainSampler,
} from "./raster-dem-terrain-runtime.test-support";
import { readCacheCeilingMemory } from "./three-tiles-cache-ceiling-memory";

describe("terrain allocation recovery", () => {
  installRasterDemTerrainRuntimeFixture();

  it("persists a smaller grant after allocation failure and uses it on the next healthy start", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    } as Storage;
    vi.stubGlobal("localStorage", storage);
    const failed = createIdlePrefetchFixture("allocation-failure", 10, {
      maxCachedMeshBytes: 512 * 1024 ** 2,
    });
    let next: ReturnType<typeof createIdlePrefetchFixture> | undefined;
    try {
      const granted = failed.runtime.getTerrainCacheStats().cacheCeilingBytes;
      const error = new RangeError("Array buffer allocation failed");
      failed.source.requestTile.mockRejectedValueOnce(error);
      await failed.start();
      await vi.waitFor(() =>
        expect(failed.onError).toHaveBeenCalledWith(error)
      );
      const learned = Math.floor(granted * 0.8);
      expect(failed.runtime.getTerrainCacheStats().cacheCeilingBytes).toBe(
        learned
      );
      expect(readCacheCeilingMemory(storage)).toMatchObject({
        learnedBytes: learned,
        reason: "allocation",
      });
      failed.runtime.dispose();
      registerSharedThreeTerrainSampler.mockClear();
      next = createIdlePrefetchFixture("allocation-recovery", 10, {
        maxCachedMeshBytes: granted,
      });
      expect(next.runtime.getTerrainCacheStats().cacheCeilingBytes).toBe(
        learned
      );
      await next.start();
      await expect(next.runtime.ready).resolves.toBe(true);
      expect(next.runtime.isBaseViewReady?.()).toBe(true);
      expect(next.onError).not.toHaveBeenCalled();
    } finally {
      failed.runtime.dispose();
      next?.runtime.dispose();
      vi.unstubAllGlobals();
    }
  });
  it("keeps complete coarse coverage without retrying deferred detail until the grant changes", async () => {
    const f = createIdlePrefetchFixture("bounded-refinement", 11, {
      maxCachedMeshBytes: 1024,
      requestConcurrency: 1,
    });
    try {
      await f.start();
      await f.runtime.ready;
      await vi.waitFor(() => expect(f.runtime.isBaseViewReady?.()).toBe(true));
      const initialKeys = f.runtime
        .getPublishedTerrainTiles()
        .map(({ tile }) => tile.id);
      expect(initialKeys).toHaveLength(1);
      const initialRequests = f.source.requestTile.mock.calls.length;
      f.runtime.setErrorTarget(0.00001);
      f.runtime.update(f.frame);
      await vi.waitFor(() =>
        expect(f.runtime.getTerrainCacheStats().memoryDeferred).toBe(true)
      );
      expect(
        f.runtime.getPublishedTerrainTiles().map(({ tile }) => tile.id)
      ).toEqual(initialKeys);
      expect(
        f.runtime.getTerrainCacheStats().cachedMeshBytes
      ).toBeLessThanOrEqual(1024);
      expect(f.source.requestTile).toHaveBeenCalledTimes(initialRequests);
      for (let i = 0; i < 5; i++) f.runtime.update(f.frame);
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(f.source.requestTile).toHaveBeenCalledTimes(initialRequests);
      expect(f.onError).not.toHaveBeenCalled();
      f.runtime.setCacheBudget(16 * 1024);
      f.runtime.update(f.frame);
      await vi.waitFor(() =>
        expect(f.source.requestTile.mock.calls.length).toBeGreaterThan(
          initialRequests
        )
      );
      await vi.waitFor(() =>
        expect(f.runtime.getTerrainCacheStats().memoryDeferred).toBe(false)
      );
      expect(
        f.runtime.getTerrainCacheStats().cachedMeshBytes
      ).toBeLessThanOrEqual(16 * 1024);
    } finally {
      f.runtime.dispose();
    }
  });
});
