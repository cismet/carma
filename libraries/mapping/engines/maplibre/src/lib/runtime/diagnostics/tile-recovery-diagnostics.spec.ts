// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tile } from "3d-tiles-renderer/core";
import { TilesRenderer } from "3d-tiles-renderer";
import { createThreeTilesRuntimeState } from "../integrations/three-tiles-runtime-state";
import type { RuntimeTilesRenderer } from "../integrations/three-tiles-runtime-types";
import { createTileRecoveryDiagnostics } from "./tile-recovery-diagnostics";

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:recovery-diagnostics-test",
  });
});
afterEach(() => vi.restoreAllMocks());

const fixture = () => {
  const state = createThreeTilesRuntimeState("mesh", "mesh.json", [7.2, 51.2], {
    diagnostics: true,
  });
  state.tiles = new TilesRenderer("mesh.json") as RuntimeTilesRenderer;
  const getStableTileId = vi.fn((tile: Tile) => tile.content?.uri ?? "root");
  const diagnostics = createTileRecoveryDiagnostics(state, {
    getStableTileId,
    isTileInMainView: () => true,
    getTileScreenError: () => 12,
  });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  return { state, diagnostics, warn, getStableTileId };
};
const tile = (uri: string) =>
  ({
    content: { uri },
    parent: null,
    geometricError: 4,
    internal: {
      hasContent: true,
      hasRenderableContent: true,
      loadingState: 0,
      basePath: "https://example.test/mesh",
    },
  } as Tile);

const eventOf = (warn: ReturnType<typeof vi.spyOn>, index = 0) =>
  JSON.parse(warn.mock.calls[index][1] as string);

describe("tile recovery diagnostics", () => {
  it("does not capture IDs, stacks or snapshots when diagnostics or telemetry are off", () => {
    const f = fixture();
    for (const options of [
      { diagnostics: false, tileTelemetry: true },
      { diagnostics: true, tileTelemetry: false },
    ]) {
      Object.assign(f.state.options, options);
      f.diagnostics.recordTileRequestTrace(tile("off.b3dm"), "admission", null);
      f.diagnostics.reportTileRecovery("update-error", new Error("off"));
    }
    expect(f.getStableTileId).not.toHaveBeenCalled();
    expect(f.warn).not.toHaveBeenCalled();
    f.state.tiles?.dispose();
  });

  it("isolates failing diagnostic identities without changing demand or queues", () => {
    const f = fixture();
    const entry = tile("current.b3dm");
    f.state.meshRefinementSupport.add(entry);
    f.state.tiles!.loadingTiles.add(entry);
    const before = {
      requested: f.state.requestedErrorTarget,
      effective: f.state.effectiveErrorTarget,
      converged: f.state.lastMainViewConverged,
      sweep: f.state.meshDemandSweepPending,
      cacheBytes: f.state.tiles!.lruCache.cachedBytes,
    };
    f.getStableTileId.mockImplementation(() => {
      throw new Error("diagnostic identity unavailable");
    });
    expect(() =>
      f.diagnostics.recordTileRequestTrace(entry, "execution", "camera-demand")
    ).not.toThrow();
    expect(() => f.diagnostics.reportTileRecovery("idle-demand")).not.toThrow();
    expect(f.warn).not.toHaveBeenCalled();
    expect(f.state.meshRefinementSupport.has(entry)).toBe(true);
    expect(f.state.tiles!.loadingTiles.has(entry)).toBe(true);
    expect(entry.internal.loadingState).toBe(0);
    expect({
      requested: f.state.requestedErrorTarget,
      effective: f.state.effectiveErrorTarget,
      converged: f.state.lastMainViewConverged,
      sweep: f.state.meshDemandSweepPending,
      cacheBytes: f.state.tiles!.lruCache.cachedBytes,
    }).toEqual(before);
    f.state.tiles?.dispose();
  });

  it("keeps a bounded plain history and full owner/queue counts with capped samples", () => {
    const f = fixture();
    for (let index = 0; index < 80; index++) {
      const entry = tile(`${index}.b3dm`);
      f.state.meshRefinementSupport.add(entry);
      f.diagnostics.recordTileRequestTrace(
        entry,
        "admission",
        "visible-refinement"
      );
    }
    const execution = tile("executed.b3dm");
    f.diagnostics.recordTileRequestTrace(
      execution,
      "execution",
      "camera-demand"
    );
    execution.content!.uri = "later-mutated.b3dm";
    const metadata = tile("child.json");
    metadata.internal.hasUnrenderableContent = true;
    metadata.internal.loadingState = 2;
    f.state.tiles!.loadingTiles.add(metadata);
    f.diagnostics.reportTileRecovery("idle-demand");
    const event = eventOf(f.warn);
    expect(event.requestTraces).toHaveLength(64);
    expect(event.requestTraces[63]).toMatchObject({
      id: "executed.b3dm",
      stage: "execution",
      reason: "camera-demand",
      stack: expect.any(String),
    });
    expect(event.ownership.support).toMatchObject({ count: 80 });
    expect(event.ownership.support.samples).toHaveLength(12);
    expect(event.pipeline.loading).toMatchObject({
      count: 1,
      states: { "2": 1 },
      metadata: { count: 1, samples: ["child.json"] },
      metadataPending: true,
    });
    expect(event.pipeline).toHaveProperty("origins");
    expect(event.pipeline).toHaveProperty("parse.limit");
    expect(event.pipeline).toHaveProperty("topology.pending.count");
    expect(JSON.stringify(event)).not.toContain("later-mutated.b3dm");
    f.state.tiles?.dispose();
  });

  it("deduplicates quiet state across frames but keeps changed targets and every error", () => {
    const f = fixture();
    f.diagnostics.reportTileRecovery("idle-demand");
    f.state.tiles!.frameCount += 1;
    f.diagnostics.recordTileRequestTrace(
      tile("rejected.b3dm"),
      "admission",
      null
    );
    f.diagnostics.reportTileRecovery("idle-demand");
    expect(f.warn).toHaveBeenCalledTimes(1);
    f.state.requestedErrorTarget += 1;
    f.diagnostics.reportTileRecovery("idle-demand");
    expect(f.warn).toHaveBeenCalledTimes(2);
    f.diagnostics.reportTileRecovery("update-error", new Error("queue failed"));
    f.diagnostics.reportTileRecovery("update-error", new Error("queue failed"));
    expect(f.warn).toHaveBeenCalledTimes(4);
    expect(eventOf(f.warn, 2).error).toContain("queue failed");
    f.state.tiles?.dispose();
  });
});
