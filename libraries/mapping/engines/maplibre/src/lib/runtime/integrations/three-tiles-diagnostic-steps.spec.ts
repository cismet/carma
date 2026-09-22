import { type Tile } from "3d-tiles-renderer/core";
import { describe, expect, it, vi } from "vitest";
import {
  TILE_QUEUE_ACTION,
  TILE_QUEUE_STAGE,
} from "../../core/tile-scheduling-policy";
import { createThreeTilesDebug } from "./three-tiles-runtime-debug";
import type { MeshTileDebugProgress } from "./three-tiles-runtime-types";
import {
  recordThreeTileWait,
  getThreeTileDiagnosticSteps,
} from "./three-tiles-diagnostic-steps";

const progress = {
  discoveredAt: 0,
  queuedAt: 0,
  downloadStartedAt: 10,
  downloadFinishedAt: 30,
  parseStartedAt: 35,
  publicationStartedAt: 45,
  publicationFinishedAt: 50,
  parseFinishedAt: 50,
  loadedAt: 45,
  visibleAt: 70,
  iterations: 1,
  lastIterationFrame: 0,
};
describe("3D tile presentation steps", () => {
  it("accounts for queue, transfer, parsing, setup, display and pending shadow time without overlap", () => {
    expect(getThreeTileDiagnosticSteps(progress, true, 100)).toEqual([
      { label: "Warten", ms: 10 },
      { label: "Laden", ms: 20 },
      { label: "Warten", ms: 5 },
      { label: "Dekodieren", ms: 10 },
      { label: "Aufbau", ms: 5 },
      { label: "Anzeige", ms: 20 },
      { label: "Schatten", ms: 30, pending: true },
    ]);
  });
  it("ends offscreen caster publication at its depth draw instead of waiting forever for colour", () => {
    const steps = getThreeTileDiagnosticSteps(
      {
        ...progress,
        visibleAt: undefined,
        shadowDepthSubmittedAt: 60,
        shadowPresentedAt: 80,
      },
      true,
      1000
    );
    expect(steps.slice(-2)).toEqual([
      { label: "Anzeige", ms: 10 },
      { label: "Schatten", ms: 20 },
    ]);
    expect(steps.some((step) => step.pending)).toBe(false);
  });
  it("freezes shadow waiting at presentation and omits it without shadow rendering", () => {
    expect(
      getThreeTileDiagnosticSteps(
        { ...progress, shadowPresentedAt: 90 },
        true,
        200
      ).at(-1)
    ).toEqual({ label: "Schatten", ms: 20 });
    expect(
      getThreeTileDiagnosticSteps(progress, false, 200).some(
        (step) => step.label === "Schatten"
      )
    ).toBe(false);
  });
});

describe("publication wait telemetry", () => {
  it("keeps independent receiver and shadow clocks and ignores duplicate observations", () => {
    const p: MeshTileDebugProgress = {
      discoveredAt: 0,
      iterations: 0,
      lastIterationFrame: 0,
    };
    expect(
      recordThreeTileWait(p, "receiver", "replacement-family", 10, "sibling")
    ).toBe(true);
    expect(
      recordThreeTileWait(p, "receiver", "replacement-family", 20, "sibling")
    ).toBe(false);
    recordThreeTileWait(p, "shadow", "shadow-family", 15, "caster");
    recordThreeTileWait(p, "receiver", "render", 30);
    recordThreeTileWait(p, "receiver", null, 35);
    expect(p.waits).toEqual([
      {
        role: "receiver",
        reason: "replacement-family",
        since: 10,
        until: 30,
        blocker: "sibling",
      },
      { role: "shadow", reason: "shadow-family", since: 15, blocker: "caster" },
      { role: "receiver", reason: "render", since: 30, until: 35 },
    ]);
    recordThreeTileWait(p, "shadow", null, 60);
    expect(p.waits?.[1].until).toBe(60);
  });
  it("bounds retained history while preserving the other role's open wait", () => {
    const p: MeshTileDebugProgress = {
      discoveredAt: 0,
      iterations: 0,
      lastIterationFrame: 0,
    };
    recordThreeTileWait(p, "shadow", "shadow-family", 0);
    for (let i = 1; i < 100; i++) {
      recordThreeTileWait(
        p,
        "receiver",
        "replacement-family",
        i * 2,
        String(i)
      );
      recordThreeTileWait(p, "receiver", null, i * 2 + 1);
    }
    expect(p.waits).toHaveLength(32);
    expect(p.waits?.[0]).toEqual({
      role: "shadow",
      reason: "shadow-family",
      since: 0,
    });
    expect(recordThreeTileWait(p, "receiver", null, 300)).toBe(false);
  });
  it("records bounded queue transitions only when enabled and keeps waiting time across frame updates", () => {
    const tile = {
      content: { uri: "child.glb" },
      internal: { basePath: "https://example.org/tiles" },
      parent: {
        content: { uri: "parent.glb" },
        internal: { basePath: "https://example.org/tiles" },
      },
    } as Tile;
    const state = {
      options: { diagnostics: false, tileTelemetry: true },
      tileDebugProgress: new WeakMap<Tile, MeshTileDebugProgress>(),
      tiles: { frameCount: 1 },
      tileCameraSignature: "camera-a",
    } as Parameters<typeof createThreeTilesDebug>[0];
    const debug = createThreeTilesDebug(
      state,
      {} as Parameters<typeof createThreeTilesDebug>[1]
    );
    const decision = {
      stage: TILE_QUEUE_STAGE.DOWNLOAD,
      action: TILE_QUEUE_ACTION.PARK,
      reason: "viewport-fill-first",
      priority: 0,
      needed: true,
      inViewport: false,
      coverageFill: false,
    };
    debug.recordTileRequestDecision(tile, decision);
    state.options.diagnostics = true;
    state.options.tileTelemetry = false;
    debug.recordTileRequestDecision(tile, decision);
    expect(state.tileDebugProgress.has(tile)).toBe(false);
    expect(debug.drainTileWaitEvents()).toEqual([]);

    state.options.tileTelemetry = true;
    const clock = vi.spyOn(performance, "now").mockReturnValue(10);
    try {
      debug.recordTileRequestDecision(tile, decision);
      expect(debug.drainTileWaitEvents()).toEqual([
        expect.objectContaining({
          ...decision,
          frame: 1,
          viewSignature: "camera-a",
          since: 10,
          observedAt: 10,
          parent: "https://example.org/tiles/parent.glb",
        }),
      ]);
      clock.mockReturnValue(20);
      state.tiles!.frameCount = 2;
      state.tileCameraSignature = "camera-b";
      debug.recordTileRequestDecision(tile, decision);
      expect(debug.drainTileWaitEvents()).toEqual([]);
      expect(state.tileDebugProgress.get(tile)?.requestDecision).toMatchObject({
        since: 10,
        observedAt: 20,
        frame: 2,
        viewSignature: "camera-b",
      });
      clock.mockReturnValue(30);
      debug.recordTileRequestDecision(tile, {
        ...decision,
        stage: TILE_QUEUE_STAGE.PARSE,
        action: TILE_QUEUE_ACTION.RUN,
        reason: "ready",
      });
      expect(debug.drainTileWaitEvents()).toEqual([
        expect.objectContaining({ stage: "parse", action: "run", since: 30 }),
      ]);
      for (let index = 0; index < 40; index++)
        debug.recordTileRequestDecision(tile, {
          ...decision,
          reason: `blocker-${index}`,
        });
      expect(debug.drainTileWaitEvents()).toHaveLength(32);
      expect(state.tileDebugProgress.get(tile)?.requestDecision?.reason).toBe(
        "blocker-39"
      );
    } finally {
      clock.mockRestore();
    }
  });
});
