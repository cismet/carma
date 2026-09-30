import { MESH_ALLOCATION_RECOVERY_PHASE } from "./three-tiles-runtime-config";
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Group } from "three";
import {
  EMPTY_CACHE_CEILING_MEMORY,
  learnCacheCeiling,
  startCacheCeilingSession,
  writeCacheCeilingMemory,
} from "./three-tiles-cache-ceiling-memory";
import { fixture } from "./three-tiles-runtime-loading.test-support";
import {
  buildTile,
  mountRuntime,
} from "./three-tiles-runtime.liveness.test-support";
import type { RuntimePriorityQueue } from "./three-tiles-runtime-types";

const MIB = 1024 ** 2;
vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:allocation-recovery-test",
  });
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, "now").mockImplementation(() => Date.now());
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
});

const failAllocation = ({ state, loading }: ReturnType<typeof fixture>) => {
  state.allocationFailed = true;
  loading.recordCacheCeilingFailure("allocation");
  loading.applyRequestConcurrency();
};

describe("allocation admission recovery", () => {
  it("requires reclaimed residency near the lowered ceiling before probing", () => {
    const subject = fixture();
    const { state, loading } = subject;
    loading.setCacheBudget(1024 * MIB);
    const cache = state.tiles!.lruCache;
    cache.cachedBytes = 1100 * MIB;
    failAllocation(subject);
    expect(state.ceilingBytes).toBe(Math.floor(1024 * MIB * 0.8));
    expect(state.memoryAdmissionPaused).toBe(true);
    expect(state.tiles!.parseQueue.maxJobs).toBe(0);
    expect(state.tiles!.downloadQueue.maxJobsPerOrigin).toBe(0);

    vi.advanceTimersByTime(1000);
    cache.cachedBytes = 700 * MIB;
    loading.applyRequestConcurrency();
    expect(state.memoryAdmissionPaused).toBe(true);
    cache.cachedBytes = 500 * MIB;
    loading.applyRequestConcurrency();
    expect(state.memoryAdmissionPaused).toBe(false);
    expect(state.allocationRecovery?.phase).toBe(
      MESH_ALLOCATION_RECOVERY_PHASE.PROBING
    );
    expect(state.tiles!.parseQueue.maxJobs).toBe(1);
    expect(state.tiles!.downloadQueue.maxJobsPerOrigin).toBe(1);
    expect(state.ceilingBytes).toBe(Math.floor(1024 * MIB * 0.8));
    state.tiles!.dispose();
  });

  it.each([0, 100 * MIB])(
    "can probe a drained, low-pressure pinned cut of %s bytes without shrinking it",
    (bytes) => {
      const subject = fixture();
      const { state, loading } = subject;
      loading.setCacheBudget(1024 * MIB);
      const cache = state.tiles!.lruCache;
      cache.cachedBytes = bytes;
      const tile = buildTile("visible.b3dm");
      state.displayedMeshFrontier.add(tile as never);
      state.committedMeshCasterFrontier.add(tile as never);
      failAllocation(subject);
      vi.advanceTimersByTime(1000);
      const parse = state.tiles!.parseQueue as RuntimePriorityQueue;
      parse.currJobs = 1;
      loading.applyRequestConcurrency();
      expect(state.memoryAdmissionPaused).toBe(true);
      parse.currJobs = 0;
      state.contextLost = true;
      loading.applyRequestConcurrency();
      expect(state.memoryAdmissionPaused).toBe(true);
      state.contextLost = false;
      loading.applyRequestConcurrency();
      expect(state.memoryAdmissionPaused).toBe(false);
      expect(state.tiles!.parseQueue.maxJobs).toBe(1);
      expect(cache.cachedBytes).toBe(bytes);
      expect(state.displayedMeshFrontier.has(tile as never)).toBe(true);
      expect(state.committedMeshCasterFrontier.has(tile as never)).toBe(true);
      state.tiles!.dispose();
    }
  );

  it("backs off repeated failures and keeps the learned ceiling lower", () => {
    const subject = fixture();
    const { state, loading } = subject;
    loading.setCacheBudget(1024 * MIB);
    failAllocation(subject);
    vi.advanceTimersByTime(1000);
    loading.applyRequestConcurrency();
    expect(state.allocationRecovery?.phase).toBe(
      MESH_ALLOCATION_RECOVERY_PHASE.PROBING
    );
    failAllocation(subject);
    expect(state.ceilingBytes).toBe(
      Math.floor(Math.floor(1024 * MIB * 0.8) * 0.8)
    );
    const retryAt = state.allocationRecovery?.retryAt;
    vi.advanceTimersByTime(1000);
    failAllocation(subject);
    expect(state.allocationRecovery?.retryAt).toBe(retryAt);
    expect(state.ceilingBytes).toBe(
      Math.floor(Math.floor(1024 * MIB * 0.8) * 0.8)
    );
    vi.advanceTimersByTime(999);
    loading.applyRequestConcurrency();
    expect(state.memoryAdmissionPaused).toBe(true);
    vi.advanceTimersByTime(1);
    loading.applyRequestConcurrency();
    expect(state.allocationRecovery?.phase).toBe(
      MESH_ALLOCATION_RECOVERY_PHASE.PROBING
    );
    expect(state.tiles!.parseQueue.maxJobs).toBe(1);
    const recovery = state.allocationRecovery;
    loading.setCacheBudget(1024 * MIB);
    expect(state.allocationRecovery).toBe(recovery);
    expect(state.ceilingBytes).toBe(
      Math.floor(Math.floor(1024 * MIB * 0.8) * 0.8)
    );
    state.tiles!.dispose();
  });

  it("keeps a paused allocation and its quality target intact when controls replay the budget", () => {
    const subject = fixture();
    const { state, loading } = subject;
    loading.setCacheBudget(1024 * MIB);
    failAllocation(subject);
    const recovery = state.allocationRecovery;
    const sampledAt = state.lastMemoryCheck;
    state.memoryErrorTarget = 9;
    state.effectiveErrorTarget = 9;
    loading.setCacheBudget(1024 * MIB);
    expect(state.allocationRecovery).toBe(recovery);
    expect(state.allocationFailed).toBe(true);
    expect(state.memoryAdmissionPaused).toBe(true);
    expect(state.lastMemoryCheck).toBe(sampledAt);
    expect(state.memoryErrorTarget).toBe(9);
    expect(state.effectiveErrorTarget).toBe(9);
    loading.setCacheBudget(1023 * MIB);
    expect(state.allocationRecovery).toBeNull();
    expect(state.allocationFailed).toBe(false);
    state.tiles!.dispose();
  });

  it.each(["allocation-first", "context-first"])(
    "learns once for a shared allocation/context loss episode: %s",
    (order) => {
      const subject = fixture();
      const { state, loading } = subject;
      loading.setCacheBudget(1024 * MIB);
      state.tiles!.lruCache.cachedBytes = 700 * MIB;
      if (order === "allocation-first") failAllocation(subject);
      loading.handleContextLost();
      if (order === "context-first") failAllocation(subject);
      const reduced = Math.floor(1024 * MIB * 0.8);
      expect(state.ceilingBytes).toBe(reduced);
      loading.handleContextLost();
      failAllocation(subject);
      expect(state.ceilingBytes).toBe(reduced);
      expect(state.allocationRecovery?.failures).toBe(1);
      vi.advanceTimersByTime(10_000);
      state.tiles!.lruCache.cachedBytes = 100 * MIB;
      loading.applyRequestConcurrency();
      expect(state.memoryAdmissionPaused).toBe(true);
      loading.handleContextRestored();
      expect(state.allocationRecovery?.phase).toBe(
        MESH_ALLOCATION_RECOVERY_PHASE.PROBING
      );
      failAllocation(subject);
      expect(state.ceilingBytes).toBe(Math.floor(reduced * 0.8));
      expect(state.allocationRecovery?.failures).toBe(2);
      state.tiles!.dispose();
    }
  );

  it("still learns from an allocation failure after a low-residency context reset", () => {
    const subject = fixture();
    const { state, loading } = subject;
    loading.setCacheBudget(1024 * MIB);
    loading.handleContextLost();
    expect(state.ceilingBytes).toBe(1024 * MIB);
    failAllocation(subject);
    expect(state.ceilingBytes).toBe(Math.floor(1024 * MIB * 0.8));
    loading.handleContextLost();
    expect(state.ceilingBytes).toBe(Math.floor(1024 * MIB * 0.8));
    state.tiles!.dispose();
  });

  it("wakes a stationary paused runtime through the existing audit and completes on model success", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { layer, renderer, frame, repaint } = mountRuntime(true);
    layer.loading.setCacheBudget(1024 * MIB);
    renderer.dispatchEvent({
      type: "load-tileset",
      url: "tileset.json",
    } as never);
    renderer.lruCache.cachedBytes = 100 * MIB;
    let framePending = false;
    // MapLibre coalesces repaint requests into frames, including timer wakeups.
    repaint.mockImplementation(() => {
      if (framePending) return;
      framePending = true;
      setTimeout(() => {
        framePending = false;
        layer.scene.update(frame);
      }, 16);
    });
    renderer.dispatchEvent({
      type: "load-error",
      tile: buildTile("failed.b3dm"),
      url: "https://example.test/failed.b3dm",
      error: new Error("allocation failed"),
    } as never);
    expect(renderer.parseQueue.maxJobs).toBe(0);
    expect(renderer.downloadQueue.maxJobsPerOrigin).toBe(0);
    vi.advanceTimersByTime(999);
    expect(renderer.parseQueue.maxJobs).toBe(0);
    vi.advanceTimersByTime(100);
    expect(renderer.parseQueue.maxJobs).toBe(1);
    expect(renderer.downloadQueue.maxJobsPerOrigin).toBe(1);
    const lowerRetention = renderer.lruCache.minBytesSize;
    const scene = new Group();
    const tile = buildTile("recovered.b3dm", scene);
    renderer.dispatchEvent({ type: "load-model", tile, scene } as never);
    expect(renderer.parseQueue.maxJobs).toBeGreaterThan(1);
    expect(renderer.downloadQueue.maxJobsPerOrigin).toBeGreaterThan(1);
    expect(renderer.lruCache.minBytesSize).toBe(lowerRetention);
    layer.scene.dispose();
  });
});

describe("resident-driven cache grant growth", () => {
  it("applies a peer's lower learned ceiling before considering local growth", () => {
    const { state, loading } = fixture();
    const seed = state.ceilingBytes;
    state.cacheCeilingStorage = localStorage;
    state.cacheCeilingMemory = startCacheCeilingSession(
      EMPTY_CACHE_CEILING_MEMORY,
      seed,
      Date.now()
    );
    const probe = state.cacheCeilingMemory.probe;
    const lower = Math.floor(seed * 0.8);
    const recovery = {
      failures: 1,
      retryAt: 0,
      failureBytes: 0,
      phase: MESH_ALLOCATION_RECOVERY_PHASE.RECOVERED,
    };
    state.allocationRecovery = recovery;
    const cache = state.tiles!.lruCache;
    loading.applyCacheBudget();
    const originalCacheLimit = cache.maxBytesSize;
    const tile = buildTile("resident.b3dm", new Group()) as never;
    cache.itemList.push(tile);
    vi.spyOn(cache, "getMemoryUsage").mockReturnValue(lower * 0.95);
    cache.cachedBytes = lower * 0.95;
    writeCacheCeilingMemory(
      localStorage,
      learnCacheCeiling(EMPTY_CACHE_CEILING_MEMORY, lower, "allocation")
    );
    vi.advanceTimersByTime(10_000);
    loading.sampleMemoryPressure();
    expect(state.ceilingBytes).toBe(lower);
    expect(state.learnedCeilingBytes).toBe(lower);
    expect(state.cacheCeilingMemory.probe).toMatchObject({
      ceilingBytes: probe!.ceilingBytes,
      startedAt: probe!.startedAt,
      healthy: probe!.healthy,
    });
    expect(state.allocationRecovery).toBe(recovery);
    expect(state.allocationFailed).toBe(false);
    expect(state.meshDemandSweepPending).toBe(true);
    expect(cache.maxBytesSize).toBeLessThan(originalCacheLimit);
    vi.advanceTimersByTime(10_000);
    loading.sampleMemoryPressure();
    expect(state.ceilingBytes).toBe(lower);
    expect(state.allocationRecovery).toBe(recovery);
    cache.itemList.length = 0;
    state.tiles!.dispose();
  });

  it("ignores queued estimates, retries quality only after growth and retains the grant on repeated settings", () => {
    const { state, loading } = fixture();
    const cache = state.tiles!.lruCache;
    const seed = state.ceilingBytes;
    const tile = buildTile("resident.b3dm") as never;
    cache.itemList.push(tile);
    Object.assign(tile, {
      internal: { hasRenderableContent: true, loadingState: 1 },
      engineData: { scene: new Group() },
    });
    vi.spyOn(cache, "getMemoryUsage").mockReturnValue(seed * 0.95);
    cache.cachedBytes = seed;
    state.memoryErrorTarget = 6;
    state.lastActiveViewsConverged = true;
    vi.advanceTimersByTime(10_000);
    loading.sampleMemoryPressure();
    expect(state.ceilingBytes).toBe(seed);
    Object.assign(tile, {
      internal: { hasRenderableContent: true, loadingState: 4 },
    });
    vi.advanceTimersByTime(1_000);
    loading.sampleMemoryPressure();
    const grown = Math.floor(seed * 1.2);
    expect(state.ceilingBytes).toBe(grown);
    expect(state.memoryErrorTarget).toBe(4);
    state.memoryErrorTarget = 6;
    vi.advanceTimersByTime(1_000);
    loading.sampleMemoryPressure();
    expect(state.ceilingBytes).toBe(grown);
    expect(state.memoryErrorTarget).toBe(6);
    loading.setCacheBudget(undefined);
    expect(state.ceilingBytes).toBe(grown);
    state.allocationFailed = true;
    loading.recordCacheCeilingFailure("allocation");
    expect(state.ceilingBytes).toBe(Math.floor(grown * 0.8));
    cache.itemList.length = 0;
    state.tiles!.dispose();
  });
});
