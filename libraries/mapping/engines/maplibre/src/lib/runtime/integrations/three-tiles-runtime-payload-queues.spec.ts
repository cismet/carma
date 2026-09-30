// @vitest-environment jsdom
import { TilesRenderer } from "3d-tiles-renderer";
import { OrthographicCamera } from "three";
import { describe, expect, it, vi } from "vitest";
import { TILE_REQUEST_NEED } from "../../core/tile-request-need";
import { mesh } from "../../core/mesh-tile-test-fixtures";
import { createThreeTilesRuntimeState } from "./three-tiles-runtime-state";
import { createThreeTilesPayloadQueues } from "./three-tiles-runtime-payload-queues";
import type { RuntimeTile } from "./three-tiles-runtime-types";

vi.hoisted(() =>
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:queue-test",
  })
);

describe("current demand owns queue refinement", () => {
  it.each([false, true])(
    "finishes needed buffers across a priority change without downloading again (shadows=%s)",
    async (shadows) => {
      vi.useFakeTimers();
      const state = createThreeTilesRuntimeState("mesh", "mesh.json", [7, 51], {
        providesTerrain: true,
      });
      state.tiles = new TilesRenderer();
      if (shadows)
        state.shadowView = {
          camera: new OrthographicCamera(),
          shadowMapSize: { width: 1024, height: 1024 },
        };
      const active = mesh() as RuntimeTile;
      const waiting = mesh() as RuntimeTile;
      active.meshRefinement = {
        group: mesh(),
        currentErrorPixels: 8,
        nextErrorPixels: 4,
        visibleAreaPixels: 25,
        benefit: 100,
        provisional: false,
      };
      waiting.meshRefinement = { ...active.meshRefinement, benefit: 1000 };
      const queues = createThreeTilesPayloadQueues(state, {
        resetMeshCameraObjectives: vi.fn(),
        getTileDebugProgress: () => undefined!,
        recordTileRequestDecision: vi.fn(),
        getTileRequestPriority: () => 1,
        getTileObserverDemand: () => ({ intersects: true, errorPixels: 8 }),
        getTileScreenError: () => 8,
        isTileNeededForMeshCoverage: () => false,
        getRetainedMeshAncestors: () => new Set(),
        isTileRequestNeeded: () => true,
        getTileRequestNeed: () => TILE_REQUEST_NEED.CAMERA,
        noteTileActivity: vi.fn(),
      });
      const disposed = vi.fn();
      state.tiles.lruCache.add(active, disposed);
      const activeJob = vi.fn().mockResolvedValue("active");
      const waitingJob = vi.fn().mockResolvedValue("waiting");
      try {
        queues.install();
        state.tiles.parseQueue.maxJobs = 1;
        const activeResult = state.tiles.parseQueue.add(active, activeJob);
        const outcome = expect(activeResult).resolves.toBe("active");
        state.tiles.parseQueue.tryRunJobs();
        const waitingResult = state.tiles.parseQueue.add(waiting, waitingJob);
        await vi.advanceTimersByTimeAsync(50);
        await outcome;
        await expect(waitingResult).resolves.toBe("waiting");
        expect(activeJob).toHaveBeenCalledOnce();
        expect(disposed).not.toHaveBeenCalled();
        expect(waitingJob).toHaveBeenCalledOnce();
      } finally {
        queues.dispose();
        state.tiles.dispose();
        vi.useRealTimers();
      }
    }
  );

  it("parks previous-sun downloads behind current demand, then finishes them without discarding", async () => {
    vi.useFakeTimers();
    const state = createThreeTilesRuntimeState("mesh", "mesh.json", [7, 51], {
      providesTerrain: true,
    });
    state.tiles = new TilesRenderer();
    const earlier = mesh(),
      current = mesh();
    earlier.internal.loadingState = current.internal.loadingState = 1;
    state.tiles.loadingTiles.add(earlier);
    state.tiles.loadingTiles.add(current);
    const queues = createThreeTilesPayloadQueues(state, {
      resetMeshCameraObjectives: vi.fn(),
      getTileDebugProgress: () => undefined!,
      recordTileRequestDecision: vi.fn(),
      getTileRequestPriority: () => 1,
      getTileObserverDemand: () => ({ intersects: false, errorPixels: 0 }),
      getTileScreenError: () => 0,
      isTileNeededForMeshCoverage: () => false,
      getRetainedMeshAncestors: () => new Set(),
      isTileRequestNeeded: () => true,
      getTileRequestNeed: (tile) =>
        tile === earlier
          ? TILE_REQUEST_NEED.SHADOW_HISTORY
          : TILE_REQUEST_NEED.SHADOW,
      noteTileActivity: vi.fn(),
    });
    const oldJob = vi.fn().mockResolvedValue("old"),
      currentJob = vi.fn().mockResolvedValue("current");
    try {
      queues.install();
      state.tiles.downloadQueue.maxJobsPerOrigin = 1;
      const oldPromise = state.tiles.downloadQueue.add(
        "https://example.test/old.b3dm",
        earlier,
        oldJob
      );
      const currentPromise = state.tiles.downloadQueue.add(
        "https://example.test/current.b3dm",
        current,
        currentJob
      );
      await vi.advanceTimersByTimeAsync(50);
      await expect(currentPromise).resolves.toBe("current");
      expect(oldJob).not.toHaveBeenCalled();
      state.tiles.loadingTiles.delete(current);
      for (const queue of state.tiles.downloadQueue.originQueues.values())
        queue.tryRunJobs();
      await vi.advanceTimersByTimeAsync(50);
      await expect(oldPromise).resolves.toBe("old");
      expect(oldJob).toHaveBeenCalledOnce();
    } finally {
      queues.dispose();
      state.tiles.dispose();
      vi.useRealTimers();
    }
  });

  it.each(
    (["download", "parse"] as const).flatMap((stage) =>
      [false, true].map((inView) => ({ stage, inView }))
    )
  )(
    "admits required $stage casters below the observer error threshold (inView=$inView)",
    async ({ stage, inView }) => {
      vi.useFakeTimers();
      const state = createThreeTilesRuntimeState("mesh", "mesh.json", [7, 51], {
        providesTerrain: true,
      });
      state.tiles = new TilesRenderer();
      state.tiles.loadAncestors = false;
      state.requestedErrorTarget =
        state.effectiveErrorTarget =
        state.memoryErrorTarget =
          1;
      state.shadowView = {
        camera: new OrthographicCamera(),
        shadowMapSize: { width: 1024, height: 1024 },
      };
      const queues = createThreeTilesPayloadQueues(state, {
        resetMeshCameraObjectives: vi.fn(),
        getTileDebugProgress: () => ({
          discoveredAt: 0,
          iterations: 0,
          lastIterationFrame: 0,
        }),
        recordTileRequestDecision: vi.fn(),
        getTileRequestPriority: () => 0,
        getTileObserverDemand: () => ({
          intersects: inView,
          errorPixels: Infinity,
        }),
        getTileScreenError: () => 0.5,
        isTileNeededForMeshCoverage: () => false,
        getRetainedMeshAncestors: () => new Set(),
        isTileRequestNeeded: () => true,
        getTileRequestNeed: () => "shadow-demand",
        noteTileActivity: vi.fn(),
      });
      const parent = mesh(null, 0.5),
        child = mesh(parent, 0.25);
      child.internal.loadingState = 1;
      const job = vi.fn().mockResolvedValue("ready");
      try {
        queues.install();
        const promise =
          stage === "download"
            ? state.tiles.downloadQueue.add(
                "https://example.test/caster.b3dm",
                child,
                job
              )
            : state.tiles.parseQueue.add(child, job);
        await vi.advanceTimersByTimeAsync(50);
        expect(job).toHaveBeenCalledOnce();
        await expect(promise).resolves.toBe("ready");
      } finally {
        queues.dispose();
        state.tiles.dispose();
        vi.useRealTimers();
      }
    }
  );
});
