// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { mesh, quartet } from "../../core/mesh-tile-test-fixtures";

import type { RuntimeTile } from "./three-tiles-runtime-types";

import { fixture } from "./three-tiles-runtime-loading.test-support";
vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-loading-worker",
  });
});

describe("eviction runtime integration", () => {
  it("protects a loaded floor before the extent floor is armed", () => {
    const { state, loading } = fixture();
    const cache = loading.getRuntimeCache()!;
    state.extentFloorArmed = false;
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

  it("pins a compatible shadow reserve and its owning metadata until replacement or disposal", () => {
    const { state, loading } = fixture();
    const cache = loading.getRuntimeCache()!;
    const parent = mesh(null, 80),
      metadata = mesh(parent, 40),
      reserve = mesh(metadata, 20);
    parent.children = [metadata];
    metadata.children = [reserve];
    metadata.internal.hasRenderableContent = false;
    metadata.internal.hasUnrenderableContent = true;
    for (const tile of [parent, metadata, reserve]) {
      cache.add(tile, () => {
        tile.internal.loadingState = 0;
      });
      cache.setMemoryUsage(tile, 100);
      cache.setLoaded(tile, true);
    }
    state.meshShadowReserve.frontier.add(reserve);
    cache.markAllUnused();
    cache.minBytesSize = 50;
    cache.maxBytesSize = 150;
    cache.minSize = 0;
    cache.maxSize = 1;
    expect(cache.remove(reserve)).toBe(false);
    expect(cache.remove(metadata)).toBe(false);
    cache.unloadUnusedContent();
    loading.wipeCacheWhileHidden();
    expect(cache.itemSet.has(reserve)).toBe(true);
    expect(cache.itemSet.has(metadata)).toBe(true);
    expect(cache.itemSet.has(parent)).toBe(false);
    state.meshShadowReserve.frontier.clear();
    // A complete finer cut replaces the reserve before its guard is released.
    const finer = mesh(reserve, 10);
    reserve.children = [finer];
    cache.maxBytesSize = 1_000;
    cache.maxSize = 10;
    cache.add(finer, () => {});
    expect(cache.itemSet.has(finer)).toBe(true);
    cache.setLoaded(finer, true);
    expect(cache.remove(reserve)).toBe(true);
    state.meshShadowReserve.frontier.add(finer);
    state.disposed = true;
    expect(cache.remove(metadata)).toBe(true);
    expect(cache.remove(finer)).toBe(true);
    state.tiles!.dispose();
  });

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

  it("keeps siblings during fine publication, then allows the coarse fallback", () => {
    const { state, loading } = fixture(true);
    const cache = loading.getRuntimeCache()!;
    const { parent, children } = quartet(mesh(null, 80));
    const [reserve, visibleSibling, ...otherSiblings] = children;
    reserve.traversal.inFrustum = false;
    const fine = mesh(visibleSibling, 10);
    visibleSibling.children = [fine];
    const disposed = vi.fn(() => {
      reserve.internal.loadingState = 0;
    });
    for (const tile of [parent, ...children, fine]) {
      cache.add(tile, tile === reserve ? disposed : vi.fn());
      cache.setMemoryUsage(tile, 100);
      cache.setLoaded(tile, true);
    }
    state.displayedMeshFrontier.add(fine);
    cache.minBytesSize = 50;
    cache.maxBytesSize = 150;
    cache.minSize = 0;
    cache.maxSize = 1;
    cache.markAllUnused();

    // The offscreen sibling and whole direct-child ring stay cached while a
    // fine child in another sibling is the exclusive published cut.
    expect(cache.remove(reserve)).toBe(false);
    cache.unloadUnusedContent();
    expect(cache.itemSet.has(reserve)).toBe(true);
    expect(otherSiblings.every((sibling) => cache.itemSet.has(sibling))).toBe(
      true
    );
    expect(disposed).not.toHaveBeenCalled();

    // Once the fine cut is gone, the cached coarse parent is a valid fallback.
    state.displayedMeshFrontier.clear();
    state.displayedMeshFrontier.add(parent);
    expect(cache.remove(reserve)).toBe(true);
    expect(disposed).toHaveBeenCalledOnce();
    expect(cache.remove(parent)).toBe(false);
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

  it.each([
    { maxBytes: 150, converged: true, remaining: false, memoryTarget: 4 },
    { maxBytes: 1000, converged: false, remaining: false, memoryTarget: 4 },
    { maxBytes: 1000, converged: true, remaining: true, memoryTarget: 4 },
    { maxBytes: 1000, converged: true, remaining: false, memoryTarget: 9 },
  ])(
    "reclaims stale support only for pressure or unfinished view: %j",
    ({ maxBytes, converged, remaining, memoryTarget }) => {
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
      cache.minBytesSize = 150;
      cache.maxBytesSize = maxBytes;
      state.lastMainViewConverged = converged;
      state.lastActiveViewsConverged = converged;
      state.memoryErrorTarget = memoryTarget;
      // Current full-family ownership survives even outside every camera.
      state.meshRefinementSupport.add(support);
      state.meshDemandSweepPending = true;
      loading.sweepSettledMeshDemand();
      expect(cache.itemSet.has(support)).toBe(true);
      expect(cache.itemSet.has(stale)).toBe(remaining);
      state.tiles!.loadingTiles.clear();
      state.tiles!.dispose();
    }
  );
});
