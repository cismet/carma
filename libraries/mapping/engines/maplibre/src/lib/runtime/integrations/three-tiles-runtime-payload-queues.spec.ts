// @vitest-environment jsdom
import { TilesRenderer } from "3d-tiles-renderer";
import { OrthographicCamera } from "three";
import { describe, expect, it, vi } from "vitest";
import { mesh } from "../../core/mesh-tile-test-fixtures";
import { createThreeTilesRuntimeState } from "./three-tiles-runtime-state";
import { createThreeTilesPayloadQueues } from "./three-tiles-runtime-payload-queues";

vi.hoisted(() =>
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:queue-test",
  })
);

describe("current demand owns queue refinement", () => {
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
