// @vitest-environment jsdom
import { Group } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixture } from "./three-tiles-runtime-loading.test-support";
import type {
  RuntimePriorityQueue,
  RuntimeTile,
} from "./three-tiles-runtime-types";

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:memory-target-probe",
  });
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000);
  vi.spyOn(performance, "now").mockImplementation(() => Date.now());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
});
const setup = () => {
  const subject = fixture();
  const { state } = subject;
  state.requestedErrorTarget = 6;
  state.memoryErrorTarget = state.effectiveErrorTarget = 30.375;
  state.memoryErrorTargetChangedAt = 0;
  state.meshInitialBasePassDone = true;
  state.lastMainViewConverged = state.lastActiveViewsConverged = true;
  const cache = state.tiles!.lruCache;
  const tile = {
    children: [],
    internal: { loadingState: 4, hasRenderableContent: true },
    engineData: { scene: new Group() },
  } as unknown as RuntimeTile;
  cache.itemList.push(tile);
  cache.usedSet.add(tile);
  state.displayedMeshFrontier.add(tile);
  cache.cachedBytes = state.ceilingBytes * 0.83;
  vi.spyOn(cache, "isFull").mockReturnValue(false);
  vi.spyOn(cache, "getMemoryUsage").mockReturnValue(cache.cachedBytes);
  return {
    ...subject,
    cleanup() {
      subject.loading.clearErrorTargetTimer();
      cache.itemList.length = 0;
      cache.usedSet.clear();
      state.tiles!.dispose();
    },
  };
};

describe("settled memory-target recovery", () => {
  it("wakes a stationary high-residency cut and makes one finer step", () => {
    const { state, loading, cleanup } = setup();
    try {
      const ceiling = state.ceilingBytes;
      const dispatch = vi.spyOn(state.tiles!, "dispatchEvent");
      loading.applyErrorTargetPolicy();
      expect(state.errorTargetTimer).not.toBe(0);
      expect(state.memoryErrorTarget).toBe(30.375);
      dispatch.mockClear();
      vi.advanceTimersByTime(5_001);
      expect(dispatch).toHaveBeenCalledWith({ type: "needs-update" });
      expect(state.map!.triggerRepaint).toHaveBeenCalled();
      loading.applyErrorTargetPolicy();
      expect(state.memoryErrorTarget).toBe(20.25);
      expect(state.ceilingBytes).toBe(ceiling);
      loading.applyErrorTargetPolicy();
      expect(state.memoryErrorTarget).toBe(20.25);
    } finally {
      cleanup();
    }
  });

  it("keeps 6px while 591 reserved requests drain at low loaded residency", () => {
    const { state, loading, cleanup } = setup();
    try {
      const cache = state.tiles!.lruCache;
      const gib = 1024 ** 3;
      state.ceilingBytes = 6 * gib;
      state.memoryErrorTarget = 9;
      cache.cachedBytes = 1.3 * gib;
      vi.mocked(cache.getMemoryUsage).mockReturnValue(cache.cachedBytes);
      loading.sampleMemoryPressure();
      expect(state.loadedResidentBytes).toBe(1.3 * gib);
      vi.advanceTimersByTime(5_001);
      loading.applyErrorTargetPolicy();
      expect(state.memoryErrorTarget).toBe(6);
      vi.mocked(cache.isFull).mockReturnValue(true);
      cache.cachedBytes = 6.006 * gib;
      state.lastMainViewConverged = state.lastActiveViewsConverged = false;
      state.tiles!.parseQueue.items = Array.from(
        { length: 591 },
        () => ({} as RuntimeTile)
      );
      vi.advanceTimersByTime(2_229);
      loading.sampleMemoryPressure();
      loading.applyErrorTargetPolicy();
      expect(state.memoryErrorTarget).toBe(6);
      expect(state.errorTargetTimer).toBe(0);
      state.tiles!.parseQueue.items.length = 0;
      vi.mocked(cache.isFull).mockReturnValue(false);
      cache.cachedBytes = 1.628 * gib;
      vi.mocked(cache.getMemoryUsage).mockReturnValue(cache.cachedBytes);
      state.lastMainViewConverged = state.lastActiveViewsConverged = true;
      vi.advanceTimersByTime(6_001);
      loading.sampleMemoryPressure();
      loading.applyErrorTargetPolicy();
      expect(state.memoryErrorTarget).toBe(6);
    } finally {
      state.tiles!.parseQueue.items.length = 0;
      cleanup();
    }
  });

  it("does not let offscreen families consume the next-view probe estimate", () => {
    const { state, loading, cleanup } = setup();
    try {
      state.displayedMeshFrontier.add({
        children: Array.from({ length: 1_000 }, () => ({
          children: [],
          geometricError: 1,
          internal: { loadingState: 0, hasRenderableContent: true },
        })),
      } as unknown as RuntimeTile);
      vi.advanceTimersByTime(5_001);
      loading.applyErrorTargetPolicy();
      expect(state.memoryErrorTarget).toBe(20.25);
    } finally {
      cleanup();
    }
  });

  it("retires a successful final probe before another pan needs the same target", () => {
    const { state, loading, cleanup } = setup();
    try {
      state.memoryErrorTarget = 9;
      vi.advanceTimersByTime(5_001);
      loading.applyErrorTargetPolicy();
      expect(state.memoryErrorTarget).toBe(6);
      // The next rendered cut must prove convergence at the new target.
      state.lastMainViewConverged = state.lastActiveViewsConverged = true;
      loading.applyErrorTargetPolicy();
      expect(state.errorTargetTimer).not.toBe(0);
      vi.advanceTimersByTime(6_001);
      loading.applyErrorTargetPolicy();
      expect(state.errorTargetTimer).toBe(0);
      state.memoryErrorTarget = 9;
      state.memoryErrorTargetChangedAt = performance.now();
      vi.advanceTimersByTime(6_001);
      loading.applyErrorTargetPolicy();
      expect(state.memoryErrorTarget).toBe(6);
    } finally {
      cleanup();
    }
  });

  it.each(["moving", "queued", "context", "allocation"])(
    "does not start a headroom probe while %s",
    (condition) => {
      const { state, loading, cleanup } = setup();
      try {
        if (condition === "moving") state.map!.isMoving = () => true;
        if (condition === "queued")
          (state.tiles!.parseQueue as RuntimePriorityQueue).items = [
            {} as RuntimeTile,
          ];
        if (condition === "context") state.contextLost = true;
        if (condition === "allocation") state.allocationFailed = true;
        vi.advanceTimersByTime(10_000);
        loading.applyErrorTargetPolicy();
        expect(state.memoryErrorTarget).toBe(30.375);
        expect(state.errorTargetTimer).toBe(0);
      } finally {
        state.tiles!.parseQueue.items.length = 0;
        cleanup();
      }
    }
  );
});
