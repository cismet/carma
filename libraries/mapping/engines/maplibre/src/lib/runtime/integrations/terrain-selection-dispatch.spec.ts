import { Camera, PerspectiveCamera, Vector2, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TerrainSelection } from "../../core/terrain-selection";
import type { TerrainWorkerResult } from "./terrain-worker-task";

const { acquireSource, runWorker, registerSampler } = vi.hoisted(() => ({
  acquireSource: vi.fn(),
  runWorker: vi.fn(),
  registerSampler: vi.fn(() => vi.fn()),
}));
vi.mock("./terrain-worker-client", () => ({ runTerrainWorkerTask: runWorker }));
vi.mock("./raster-dem-terrain-tile-source", async (original) => ({
  ...(await original<typeof import("./raster-dem-terrain-tile-source")>()),
  acquireRasterDemTerrainTileSource: acquireSource,
}));
vi.mock("./shared-three-terrain-registry", () => ({
  registerSharedThreeTerrainSampler: registerSampler,
  setSharedThreeTerrainLoading: vi.fn(),
  notifySharedThreeTerrainChanged: vi.fn(),
}));

import { buildRasterDemTerrainRuntime } from "./raster-dem-terrain-runtime";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("coalesced asynchronous terrain selection", () => {
  it("uses an in-flight cut during a pan, then only the latest view; ignores disposed results", async () => {
    vi.stubGlobal("Worker", class {});
    const pending: ((result: TerrainWorkerResult) => void)[] = [];
    runWorker.mockImplementation(
      () => new Promise((resolve) => pending.push(resolve))
    );
    const source = {
      sampleHeight: vi.fn(),
      trimCache: vi.fn(),
      requestTile: vi.fn(() => new Promise(() => undefined)),
    };
    acquireSource.mockResolvedValue(source);
    const runtime = buildRasterDemTerrainRuntime(
      "selection-test",
      {
        id: "dem",
        url: "https://example.invalid/{z}/{x}/{y}.png",
        encoding: "terrarium",
        tileSize: 512,
        minzoom: 5,
        maxzoom: 16,
        bounds: [6.4, 50.8, 7.8, 51.6],
      },
      [7.2, 51.27],
      { maximumLevel: 16 }
    );
    const map = {
      getBounds: () => ({
        getWest: () => 7.19,
        getEast: () => 7.21,
        getSouth: () => 51.26,
        getNorth: () => 51.28,
      }),
      triggerRepaint: vi.fn(),
    };
    runtime.onAdd?.(map as never);
    await vi.waitFor(() => expect(registerSampler).toHaveBeenCalled());
    const frame = {
      map: map as never,
      renderCamera: new Camera(),
      lodCamera: new PerspectiveCamera(45, 1, 1, 10000),
      viewport: new Vector2(2560, 1440),
      lookTarget: new Vector3(),
    };
    frame.lodCamera.position.set(0, 1000, 1000);
    runtime.update(frame);
    for (const x of [10, 20, 30]) {
      frame.lodCamera.position.x = x;
      runtime.update(frame);
    }
    expect(runWorker).toHaveBeenCalledTimes(1);
    const firstId = { level: 16, x: 34078, y: 21920 };
    const selection = (id: typeof firstId): TerrainSelection => ({
      entries: [{ id, kind: "source" }],
      loadEntries: [{ id, kind: "source" }],
      viewportStages: [[{ id, kind: "source" }]],
      signature: String(id.x),
      viewportElevationSignature: String(id.x),
    });
    pending.shift()!({ kind: "select", selection: selection(firstId) });
    await vi.waitFor(() => expect(runWorker).toHaveBeenCalledTimes(2));
    expect(source.requestTile).toHaveBeenCalledWith(firstId);
    expect(runWorker.mock.calls[1][0].input.lodCameraPosition[0]).toBe(30);
    // An identical frame while pending does not enqueue another walk.
    runtime.update(frame);
    runtime.dispose();
    pending.shift()!({
      kind: "select",
      selection: selection({ ...firstId, x: firstId.x + 1 }),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(source.requestTile).toHaveBeenCalledTimes(1);
    expect(runWorker).toHaveBeenCalledTimes(2);
    expect(runWorker.mock.calls[1][1].aborted).toBe(true);
  });
});
