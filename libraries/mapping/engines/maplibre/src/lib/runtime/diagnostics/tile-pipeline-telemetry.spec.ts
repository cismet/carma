import { notifyTileResponse } from "../integrations/tile-response-observers";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tile } from "3d-tiles-renderer/core";
import type { TilesRuntimeDebugState } from "./tile-diagnostic-state";
import { createTilePipelineTelemetry } from "./tile-pipeline-telemetry";

const setup = () => {
  let now = 100;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  let deliver: (entries: PerformanceEntry[]) => void = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal(
    "PerformanceObserver",
    class {
      constructor(callback: PerformanceObserverCallback) {
        deliver = (entries) =>
          callback(
            { getEntries: () => entries } as PerformanceObserverEntryList,
            this as unknown as PerformanceObserver
          );
      }
      observe() {}
      takeRecords() {
        return [];
      }
      disconnect = disconnect;
    }
  );
  const listeners = new Map<string, (event: unknown) => void>();
  const tile = { internal: { loadingState: 1 } } as Tile;
  const progress = {
    queuedAt: 100,
    discoveredAt: 100,
    iterations: 0,
    lastIterationFrame: 0,
  };
  const state = {
    tiles: {
      addEventListener: (name: string, callback: (event: unknown) => void) =>
        listeners.set(name, callback),
      removeEventListener: (name: string) => listeners.delete(name),
      loadingTiles: new Set([tile]),
      downloadQueue: { maxJobsPerOrigin: 8 },
      parseQueue: { maxJobs: 2, currJobs: 1 },
    },
    tileDebugProgress: new WeakMap([[tile, progress]]),
    displayedMeshFrontier: new Set<Tile>(),
    pendingMeshReceiverFrontier: new Set([tile]),
  } as unknown as TilesRuntimeDebugState;
  return {
    state,
    tile,
    progress,
    listeners,
    deliver: (entries: PerformanceEntry[]) => deliver(entries),
    disconnect,
    time: (value: number) => {
      now = value;
    },
  };
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("debug pipeline subscription", () => {
  it("counts only this runtime's responses, records its preparation and releases observers/listeners", () => {
    const f = setup();
    const telemetry = createTilePipelineTelemetry(() => f.state);
    const url = "https://tiles.test/mesh.b3dm";
    f.listeners.get("tile-download-start")!({ url, tile: f.tile });
    const resource = {
      name: url,
      duration: 400,
      requestStart: 100,
      responseStart: 300,
      responseEnd: 500,
      transferSize: 0,
      encodedBodySize: 0,
    } as PerformanceResourceTiming;
    f.time(300);
    notifyTileResponse(f.state.tiles!, { url, contentLength: 2 ** 19 });
    f.listeners.get("load-tileset")!({ url: "metadata.json" });
    f.deliver([
      resource,
      { ...resource, name: "https://other.test/unrelated.b3dm" },
    ]);
    notifyTileResponse(f.state.tiles!, { url, decodedBytes: 2 ** 22 });
    Object.assign(f.progress, {
      downloadFinishedAt: 500,
      parseStartedAt: 600,
      parseFinishedAt: 800,
    });
    f.listeners.get("load-model")!({ tile: f.tile });
    f.state.displayedMeshFrontier = new Set([f.tile]);
    f.time(2100);
    expect(telemetry.sample()).toMatchObject({
      downloadMiBs: Number.NaN,
      fileMiBs: 0.25,
      decodedMiBs: 2,
      decodedFileKiB: 4096,
      headersMs: 200,
      metadataReadyPerS: 0.5,
      downloadsPerS: 0.5,
      prepareMs: 200,
      parseWaitMs: 100,
      preparedPerS: 0.5,
      presentedPerS: 0.5,
    });
    f.time(3100);
    expect(telemetry.sample()).toMatchObject({
      downloadsPerS: 0,
      preparedPerS: 0,
      presentedPerS: 0,
    });
    telemetry.dispose();
    expect(f.disconnect).toHaveBeenCalledOnce();
    expect(f.listeners.size).toBe(0);
  });

  it("keeps current backlog ages and configured slots separate from throughput", () => {
    const f = setup();
    Object.assign(f.progress, { requestDecision: { action: "park" } });
    const telemetry = createTilePipelineTelemetry(() => f.state);
    f.time(1100);
    expect(telemetry.sample()).toMatchObject({
      queueAgeMs: 1000,
      blocked: 1,
      heldReceivers: 1,
      parseActive: 1,
      parseSlots: 2,
      downloadSlotsPerOrigin: 8,
      downloadsPerS: 0,
    });
    f.tile.internal.loadingState = 3;
    Object.assign(f.progress, { downloadFinishedAt: 1200 });
    f.time(1800);
    expect(telemetry.sample().parseQueueAgeMs).toBe(600);
    telemetry.dispose();
  });
});
