// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import type { RuntimeTile } from "./three-tiles-runtime-types";

import { fixture } from "./three-tiles-runtime-loading.test-support";
vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-loading-worker",
  });
});

describe("eviction runtime integration", () => {
  it("never evicts the configured residual surface, even with a ready coarser replacement or a hidden tab", () => {
    const { state, loading } = fixture();
    const cache = loading.getRuntimeCache()!;
    state.extentFloorArmed = true;
    state.extentGeometricError = 40;
    const parent = {
      refine: "REPLACE",
      parent: null,
      children: [],
      geometricError: 80,
      internal: { hasRenderableContent: true, loadingState: 4 },
      traversal: { inFrustum: false, error: 80 },
    } as unknown as RuntimeTile;
    const floor = {
      ...parent,
      geometricError: 40,
      parent,
      internal: { ...parent.internal },
      children: [],
    } as RuntimeTile;
    const detail = {
      ...floor,
      geometricError: 20,
      parent: floor,
      internal: { ...floor.internal },
      children: [],
    } as RuntimeTile;
    parent.children = [floor];
    floor.children = [detail];
    const disposed: RuntimeTile[] = [];
    for (const tile of [parent, floor, detail]) {
      cache.add(tile, () => {
        tile.internal.loadingState = 0;
        disposed.push(tile);
      });
      cache.setMemoryUsage(tile, 100);
      cache.setLoaded(tile, true);
    }
    cache.markAllUnused();
    cache.minBytesSize = 50;
    cache.maxBytesSize = 150;
    cache.minSize = 0;
    cache.maxSize = 1;
    expect(cache.remove(floor)).toBe(false);
    cache.unloadUnusedContent();
    expect(cache.itemSet.has(floor)).toBe(true);
    expect(disposed).not.toContain(floor);
    loading.wipeCacheWhileHidden();
    expect(cache.itemSet.has(floor)).toBe(true);
    expect(cache.itemSet.has(parent)).toBe(true);
    expect(cache.itemSet.has(detail)).toBe(false);
    // Explicit runtime disposal remains allowed to release the entire scene.
    state.disposed = true;
    expect(cache.remove(floor)).toBe(true);
    state.tiles!.dispose();
  });

  it.each(["receiver", "caster"] as const)(
    "guards direct and batch eviction of a published %s and its reserve",
    (role) => {
      const { state, loading } = fixture();
      const cache = loading.getRuntimeCache()!;
      const parent = {
        refine: "REPLACE",
        children: [],
        parent: null,
        internal: { hasRenderableContent: true, loadingState: 4 },
        traversal: { inFrustum: false, error: 100 },
      } as unknown as RuntimeTile;
      const child = {
        ...parent,
        parent,
        internal: { ...parent.internal },
      } as RuntimeTile;
      parent.children = [child];
      const dispose = vi.fn();
      for (const tile of [parent, child]) {
        cache.add(tile, () => {
          tile.internal.loadingState = 0;
          dispose(tile);
        });
        cache.setMemoryUsage(tile, 100);
        cache.setLoaded(tile, true);
      }
      cache.minBytesSize = 50;
      cache.maxBytesSize = 150;
      cache.minSize = 0;
      cache.maxSize = 1;
      cache.markAllUnused();
      const published =
        role === "caster"
          ? state.committedMeshCasterFrontier
          : state.displayedMeshFrontier;
      child.traversal.inFrustum = role === "receiver";
      parent.traversal.error = 1; // Coarse fallback meets target but cannot downgrade a published tile.
      published.add(child);
      expect(cache.remove(child)).toBe(false);
      cache.unloadUnusedContent(); // Upstream bypasses remove() here.
      expect(dispose).not.toHaveBeenCalled();
      expect(cache.itemList).toHaveLength(2);
      published.clear();
      state.displayedMeshFrontier.add(parent); // The old tile has left its demand domain.
      cache.unloadUnusedContent();
      expect(dispose).toHaveBeenCalledOnce();
      expect(dispose).toHaveBeenCalledWith(child);
      expect(cache.itemList).toEqual([parent]);
      loading.wipeCacheWhileHidden();
      state.tiles!.dispose();
    }
  );

  it("keeps reusable tiles above the soft watermark while the hard budget has room", () => {
    const { state, loading } = fixture();
    const cache = loading.getRuntimeCache()!;
    const tile = {
      internal: { loadingState: 4, hasRenderableContent: true },
    } as RuntimeTile;
    const dispose = vi.fn();
    cache.add(tile, dispose);
    cache.setMemoryUsage(tile, 100);
    cache.setLoaded(tile, true);
    cache.minBytesSize = 50;
    cache.maxBytesSize = 200;
    cache.markAllUnused();
    cache.unloadUnusedContent();
    expect(dispose).not.toHaveBeenCalled();
    loading.wipeCacheWhileHidden();
    state.tiles!.dispose();
  });

  it("preserves unpresented residual coverage through pan and zoom-out without an idle-ring flag", () => {
    const { state, loading } = fixture(true);
    const cache = loading.getRuntimeCache()!;
    const reserve = {
      refine: "REPLACE",
      children: [],
      parent: null,
      internal: { hasRenderableContent: true, loadingState: 4 },
      traversal: { inFrustum: false, error: 100 },
    } as unknown as RuntimeTile;
    const dispose = vi.fn(() => {
      reserve.internal.loadingState = 0;
    });
    cache.add(reserve, dispose);
    expect(cache.remove(reserve)).toBe(false);
    reserve.traversal.inFrustum = true; // Zoom-out exposes the resident reserve.
    expect(cache.remove(reserve)).toBe(false);
    const parent = {
      ...reserve,
      children: [reserve],
      internal: { ...reserve.internal },
      traversal: { inFrustum: true, error: 10 },
    } as RuntimeTile;
    reserve.parent = parent;
    cache.add(parent, vi.fn());
    state.displayedMeshFrontier.add(parent);
    state.displayedMeshFrontier.add(reserve);
    // Motion admission allows 20px, but existing detail is retained at 4px.
    expect(cache.remove(reserve)).toBe(false);
    parent.traversal.error = 3; // Even a target-quality ancestor cannot downgrade it.
    expect(cache.remove(reserve)).toBe(false);
    reserve.traversal.inFrustum = false; // Offscreen history may yield to its parent.
    expect(cache.remove(reserve)).toBe(true);
    expect(dispose).toHaveBeenCalledOnce();
    expect(cache.remove(parent)).toBe(false); // Never erase the last coverage.
    loading.wipeCacheWhileHidden();
    state.tiles!.dispose();
  });

  it("keeps resident reserve coverage until a resident parent replaces it, without pinning pending work", () => {
    const { state, loading } = fixture();
    const cache = loading.getRuntimeCache()!;
    const tile = {
      refine: "REPLACE",
      children: [],
      parent: null,
      idleRing: true,
      internal: { hasRenderableContent: true, loadingState: 4 },
      traversal: { inFrustum: false, error: 100 },
    } as unknown as RuntimeTile;
    const removed = vi.fn();
    cache.add(tile, removed);
    expect(cache.remove(tile)).toBe(false);
    expect(removed).not.toHaveBeenCalled();
    const parent = {
      ...tile,
      children: [tile],
      internal: { ...tile.internal },
    } as RuntimeTile;
    tile.parent = parent;
    cache.add(parent, vi.fn());
    let textured = false;
    state.tiles!.registerPlugin({
      name: "CARMA_DEFERRED_TILE_MATERIALS",
      isReady: () => textured,
    });
    expect(cache.remove(tile)).toBe(false);
    textured = true;
    expect(cache.remove(tile)).toBe(true);
    expect(removed).toHaveBeenCalledOnce();
    // It cannot cascade into erasing the last replacement either.
    expect(cache.remove(parent)).toBe(false);
    const pending = {
      ...tile,
      internal: { ...tile.internal, loadingState: 2 },
    } as RuntimeTile;
    cache.add(pending, vi.fn());
    expect(cache.remove(pending)).toBe(true);
    // Deliberate teardown is exempt from persistent coverage.
    loading.wipeCacheWhileHidden();
    expect(cache.itemList).toHaveLength(0);
    state.tiles!.dispose();
  });

  it("releases stale offscreen support under memory pressure", () => {
    const { state, loading } = fixture();
    const cache = loading.getRuntimeCache()!;
    state.viewFrustumsReady = true;
    const offscreenSibling = (uri: string) =>
      ({
        refine: "REPLACE",
        parent: null,
        children: [],
        geometricError: 20,
        content: { uri },
        engineData: { boundingVolume: { getAABB: () => undefined } },
        internal: { hasRenderableContent: true, loadingState: 1 },
        traversal: { inFrustum: false, error: 100 },
      } as unknown as RuntimeTile);
    const support = offscreenSibling("support.b3dm");
    const stale = offscreenSibling("stale.b3dm");
    for (const tile of [support, stale]) {
      cache.add(tile, vi.fn());
      cache.setMemoryUsage(tile, 100);
      state.tiles!.loadingTiles.add(tile);
    }
    cache.markAllUnused();
    // The sweep releases only under memory pressure.
    cache.maxBytesSize = 150;
    // A previous publication prerequisite does not retain offscreen demand.
    state.meshRefinementSupport.add(support);
    state.meshDemandSweepPending = true;
    loading.sweepSettledMeshDemand();
    expect(cache.itemSet.has(support)).toBe(false);
    // The first obsolete request releases enough memory; do not over-evict.
    expect(cache.itemSet.has(stale)).toBe(true);
    state.tiles!.loadingTiles.clear();
    state.tiles!.dispose();
  });
});
