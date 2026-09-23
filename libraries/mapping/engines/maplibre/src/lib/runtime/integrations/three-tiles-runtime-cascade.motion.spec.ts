import { describe, expect, it, vi } from "vitest";

import { createThreeTilesCascade } from "./three-tiles-runtime-cascade";
import { createThreeTilesMotionPrefetch } from "./three-tiles-motion-prefetch";
import type { RuntimeTile } from "./three-tiles-runtime-types";
import { LOADED_LOADING_STATE } from "./three-tiles-runtime-vendor";
import {
  tile,
  createPrefetchFixture,
} from "./three-tiles-runtime-cascade.test-support";

describe("motion runtime integration", () => {
  it("includes the primary observer when adopting a future request after a pan", async () => {
    const child = tile();
    const f = createPrefetchFixture(child);
    const p = createThreeTilesMotionPrefetch(
      {
        ...f.state,
        options: { providesTerrain: true },
        meshBaseCoverageReady: true,
      } as never,
      f.dependencies
    );
    try {
      p.setView(f.snapshot, "path", 1000);
      await new Promise((resolve) => setTimeout(resolve, 5));
      f.dependencies.getTileCameraDemand.mockImplementation(((
        _tile: RuntimeTile,
        includeObserver: boolean
      ) => ({
        required: includeObserver,
        receiver: false,
        errorRatio: 2,
        priority: includeObserver ? 1 : -Infinity,
      })) as never);
      p.clear();
      expect(f.tiles.lruCache.remove).not.toHaveBeenCalled();
      expect(p.needed(child)).toBe(true);
      expect(f.dependencies.getTileCameraDemand).toHaveBeenLastCalledWith(
        child,
        true
      );
    } finally {
      p.dispose();
    }
  });

  it("does not evict a completed prefetch when its expiry beats promise cleanup", async () => {
    const child = tile();
    const f = createPrefetchFixture(child);
    const p = createThreeTilesMotionPrefetch(
      {
        ...f.state,
        options: { providesTerrain: true },
        meshBaseCoverageReady: true,
      } as never,
      f.dependencies
    );
    try {
      p.setView(f.snapshot, "path", 1000);
      await new Promise((resolve) => setTimeout(resolve, 5));
      child.internal.loadingState = LOADED_LOADING_STATE;
      p.clear();
      expect(f.tiles.lruCache.remove).not.toHaveBeenCalled();
      expect(child.motionPrefetch).toBe(false);
      expect(p.getStats().pending).toBe(0);
      expect(f.state.map.triggerRepaint).not.toHaveBeenCalled();
    } finally {
      p.dispose();
    }
  });

  it("does not spend the eviction reserve on prediction even below the hard ceiling", async () => {
    const f = createPrefetchFixture(tile());
    Object.assign(f.tiles.lruCache, {
      cachedBytes: 900,
      minBytesSize: 1000,
      maxBytesSize: 2000,
    });
    const p = createThreeTilesMotionPrefetch(
      {
        ...f.state,
        options: { providesTerrain: true },
        meshBaseCoverageReady: true,
      } as never,
      f.dependencies
    );
    try {
      p.setView(f.snapshot, "path", 1000);
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(f.tiles.requestTileContents).not.toHaveBeenCalled();
      expect(f.tiles.lruCache.remove).not.toHaveBeenCalled();
    } finally {
      p.dispose();
    }
  });

  it("waits for visible convergence before refining or polling reserve rings", () => {
    vi.useFakeTimers();
    const f = createPrefetchFixture(tile());
    const dispatchEvent = vi.fn();
    Object.assign(f.tiles, { dispatchEvent, loadAncestors: false });
    const state = {
      ...f.state,
      meshBaseCoverageReady: true,
      lastMainViewConverged: false,
      extentFloorPending: 0,
      ringRefinePasses: 0,
      lastRingRefineAt: -Infinity,
      lastTraversalMs: 0,
    };
    const cascade = createThreeTilesCascade(state as never, f.dependencies);
    try {
      cascade.refineRingCascade();
      cascade.scheduleCascadeTick();
      vi.advanceTimersByTime(10000);
      expect(state.ringRefinePasses).toBe(0);
      expect(dispatchEvent).not.toHaveBeenCalled();
      state.lastMainViewConverged = true;
      cascade.refineRingCascade();
      expect(state.ringRefinePasses).toBe(1);
      expect(dispatchEvent).toHaveBeenCalled();
    } finally {
      cascade.clearCascadeTick();
      cascade.motionPrefetch.dispose();
      vi.useRealTimers();
    }
  });

  it("does not poll ring refinement when memory leaves no room for another ring", () => {
    vi.useFakeTimers();
    const f = createPrefetchFixture(tile());
    const dispatchEvent = vi.fn();
    Object.assign(f.tiles, { dispatchEvent, loadAncestors: false });
    Object.assign(f.tiles.lruCache, { cachedBytes: 1000 });
    const c = createThreeTilesCascade(
      {
        ...f.state,
        meshBaseCoverageReady: true,
        lastMainViewConverged: true,
        extentFloorPending: 0,
        ringRefinePasses: 0,
      } as never,
      f.dependencies
    );
    try {
      c.scheduleCascadeTick();
      vi.advanceTimersByTime(10000);
      expect(dispatchEvent).not.toHaveBeenCalled();
    } finally {
      c.clearCascadeTick();
      c.motionPrefetch.dispose();
      vi.useRealTimers();
    }
  });

  it("backs off optional retries after preemption, without blocking live adoption", async () => {
    const child = tile();
    const f = createPrefetchFixture(child);
    const p = createThreeTilesMotionPrefetch(
      {
        ...f.state,
        options: { providesTerrain: true },
        meshBaseCoverageReady: true,
      } as never,
      f.dependencies
    );
    try {
      p.setView(f.snapshot, "path", 1000);
      await new Promise((resolve) => setTimeout(resolve, 5));
      f.tiles.lruCache.remove(child);
      await new Promise((resolve) => setTimeout(resolve, 5));
      p.setView(f.snapshot, "path", 1000);
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(f.tiles.requestTileContents).toHaveBeenCalledTimes(1);
      expect(p.getStats().cancelled).toBe(1);
      f.dependencies.getTileCameraDemand.mockReturnValue({
        required: true,
        receiver: true,
        errorRatio: 2,
        priority: 1,
      });
      expect(p.needed(child)).toBe(true);
    } finally {
      p.dispose();
    }
  });

  it("does not request ahead before base coverage; uses the same pool and whole family afterwards", async () => {
    const children = [tile(), tile()];
    const root = tile(true, children);
    root.geometricError = 100;
    const f = createPrefetchFixture(root);
    const state = {
      ...f.state,
      options: { providesTerrain: true },
      meshBaseCoverageReady: false,
    };
    const p = createThreeTilesMotionPrefetch(state as never, f.dependencies);
    try {
      p.setView(f.snapshot, "path", 1000);
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(f.tiles.requestTileContents).not.toHaveBeenCalled();
      state.meshBaseCoverageReady = true;
      p.setView(f.snapshot, "path", 1000);
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(
        f.tiles.requestTileContents.mock.calls.map(([child]) => child)
      ).toEqual(children);
      expect(p.getStats().pending).toBe(2);
      expect(f.tiles.visibleTiles.size).toBe(0);
      expect(p.needed(children[0])).toBe(true);
    } finally {
      p.dispose();
    }
  });

  it("expires even without another rendered frame and preserves work adopted by the live view", async () => {
    const child = tile();
    const f = createPrefetchFixture(child);
    const p = createThreeTilesMotionPrefetch(
      {
        ...f.state,
        options: { providesTerrain: true },
        meshBaseCoverageReady: true,
      } as never,
      f.dependencies
    );
    try {
      p.setView(f.snapshot, "path", 30);
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(p.getStats().pending).toBe(1);
      f.dependencies.getTileCameraDemand.mockReturnValue({
        required: true,
        receiver: true,
        errorRatio: 2,
        priority: 1,
      });
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(p.getStats().views).toBe(0);
      expect(f.tiles.lruCache.remove).not.toHaveBeenCalled();
      f.dependencies.getTileCameraDemand.mockReturnValue({
        required: false,
        receiver: false,
        errorRatio: 0,
        priority: -Infinity,
      });
      p.setView(null, "path");
      expect(f.tiles.lruCache.remove).toHaveBeenCalledWith(child);
    } finally {
      p.dispose();
    }
  });

  it("does not allocate speculative tiles under memory pressure", async () => {
    const f = createPrefetchFixture(tile());
    f.tiles.lruCache.cachedBytes = 900;
    const p = createThreeTilesMotionPrefetch(
      {
        ...f.state,
        options: { providesTerrain: true },
        meshBaseCoverageReady: true,
      } as never,
      f.dependencies
    );
    try {
      p.setView(f.snapshot, "path", 1000);
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(f.tiles.requestTileContents).not.toHaveBeenCalled();
    } finally {
      p.dispose();
    }
  });
});
