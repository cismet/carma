import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tile } from "3d-tiles-renderer/core";
import { Box3, Group, OrthographicCamera, Vector3 } from "three";
import {
  createTileCameraDemand,
  snapshotTileCameraViews,
  TILE_CAMERA_ROLE,
  TILE_MAIN_OBSERVER_ID,
} from "../../core/tile-camera-demand";
import type { TilesRuntimeDebugState } from "./tile-diagnostic-state";
import { createTilePipelineTelemetry } from "./tile-pipeline-telemetry";
import { notifyTileResponse } from "../integrations/tile-response-observers";

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
      downloadQueue: {
        maxJobsPerOrigin: 8,
        originQueues: new Map([
          ["mesh.test", { currJobs: 5 }],
          ["other.test", { currJobs: 2 }],
        ]),
      },
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

  it.each(["resource-first", "body-first"])(
    "counts the observed body duration once with hidden timing (%s)",
    (order) => {
      const f = setup();
      const telemetry = createTilePipelineTelemetry(() => f.state);
      const url = "https://tiles.test/mesh.b3dm";
      f.listeners.get("tile-download-start")!({ url, tile: f.tile });
      f.time(300);
      notifyTileResponse(f.state.tiles!, { url, contentLength: 0 });
      const resource = {
        name: url,
        duration: 700,
        requestStart: 0,
        responseStart: 0,
        responseEnd: 800,
        transferSize: 0,
        encodedBodySize: 0,
      } as PerformanceResourceTiming;
      if (order === "resource-first") {
        f.deliver([resource]);
        expect(telemetry.sample().bodyMs).toBeNaN();
      }
      f.time(800);
      notifyTileResponse(f.state.tiles!, { url, decodedBytes: 2 ** 20 });
      if (order === "body-first") f.deliver([resource]);
      expect(telemetry.sample()).toMatchObject({
        bodyMs: 500,
        ttfbMs: Number.NaN,
      });
      f.deliver([resource]);
      notifyTileResponse(f.state.tiles!, { url, decodedBytes: 2 ** 20 });
      expect(telemetry.sample().bodyMs).toBeNaN();
      telemetry.dispose();
    }
  );

  it.each(["resource-first", "body-first"])(
    "preserves native body timing without adding the fallback (%s)",
    (order) => {
      const f = setup();
      const telemetry = createTilePipelineTelemetry(() => f.state);
      const url = "https://tiles.test/mesh.b3dm";
      f.listeners.get("tile-download-start")!({ url, tile: f.tile });
      f.time(300);
      notifyTileResponse(f.state.tiles!, { url, contentLength: 0 });
      const resource = {
        name: url,
        duration: 400,
        requestStart: 100,
        responseStart: 300,
        responseEnd: 500,
        transferSize: 0,
        encodedBodySize: 0,
      } as PerformanceResourceTiming;
      if (order === "resource-first") f.deliver([resource]);
      f.time(800);
      notifyTileResponse(f.state.tiles!, { url, decodedBytes: 2 ** 20 });
      if (order === "body-first") f.deliver([resource]);
      expect(telemetry.sample()).toMatchObject({ bodyMs: 200, ttfbMs: 200 });
      expect(telemetry.sample().bodyMs).toBeNaN();
      telemetry.dispose();
    }
  );

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
      downloadActivePerOrigin: 5,
      downloadsPerS: 0,
    });
    f.tile.internal.loadingState = 3;
    Object.assign(f.progress, { downloadFinishedAt: 1200 });
    f.time(1800);
    expect(telemetry.sample().parseQueueAgeMs).toBe(600);
    telemetry.dispose();
  });
});

describe("visible main-camera geometric SSE", () => {
  it.each([
    ["complete", 10],
    ["outside", Number.NaN],
    ["partial", 30],
    ["underlay", 30],
    ["unmounted", 30],
    ["unknown metadata", 30],
    ["unknown bounds", 30],
    ["additive", 30],
  ] as const)(
    "measures the exposed hierarchy cut for %s branches",
    (mode, max) => {
      const f = setup();
      const group = new Group();
      const camera = new OrthographicCamera(-4, 4, 4, -4, 0.1, 100);
      const createTile = (error: number, x = 0, halfWidth = 1): Tile => {
        const scene = new Group();
        group.add(scene);
        return {
          geometricError: error,
          refine: "REPLACE",
          children: [],
          internal: {
            loadingState: 4,
            hasContent: true,
            hasRenderableContent: true,
          },
          engineData: {
            scene,
            boundingVolume: {
              getAABB: (target: Box3) =>
                target.set(
                  new Vector3(x - halfWidth, -1, -11),
                  new Vector3(x + halfWidth, 1, -9)
                ),
            },
          },
        } as unknown as Tile;
      };
      const parent = createTile(0.3, 0, mode === "outside" ? 101 : 2);
      const children = [
        createTile(0.1, mode === "outside" ? -100 : -1),
        createTile(0.1, mode === "outside" ? 100 : 1),
      ];
      parent.children = children;
      children.forEach((child) => {
        child.parent = parent;
      });
      if (mode === "unknown metadata") children[1].internal = undefined!;
      if (mode === "unknown bounds")
        (
          children[1] as unknown as { engineData: { boundingVolume?: unknown } }
        ).engineData.boundingVolume = undefined;
      if (mode === "unmounted")
        (
          children[1] as unknown as { engineData: { scene: Group } }
        ).engineData.scene.removeFromParent();
      if (mode === "additive") parent.refine = "ADD";
      Object.assign(f.state.tiles!, { group });
      f.state.tileCameraDemand = createTileCameraDemand(
        snapshotTileCameraViews([
          {
            id: TILE_MAIN_OBSERVER_ID,
            camera,
            viewport: [800, 800],
            errorTargetPixels: 6,
            role: TILE_CAMERA_ROLE.RECEIVER,
          },
        ])
      );
      const missingChild = mode === "partial" || mode === "underlay";
      f.state.displayedMeshFrontier = new Set([
        ...(mode === "underlay" ? [] : [parent]),
        children[0],
        ...(missingChild ? [] : [children[1]]),
      ]);
      f.state.meshUnderlayFrontier = new Set(
        mode === "underlay" ? [parent] : []
      );
      const telemetry = createTilePipelineTelemetry(() => f.state);
      expect(telemetry.sample().visibleErrorMaxPx).toBe(max);
      telemetry.dispose();
    }
  );

  it("uses CSS viewport geometry, excludes caster/cache/offscreen tiles and reuses unchanged bounds", () => {
    const f = setup();
    const group = new Group();
    const camera = new OrthographicCamera(-4, 4, 4, -4, 0.1, 100);
    const view = () =>
      snapshotTileCameraViews([
        {
          id: TILE_MAIN_OBSERVER_ID,
          camera,
          viewport: [800, 800],
          errorTargetPixels: 64,
          role: TILE_CAMERA_ROLE.RECEIVER,
        },
      ]);
    const demand = (extra = false) =>
      createTileCameraDemand([
        ...view(),
        ...(extra
          ? [{ ...view()[0], id: "shadow", errorTargetPixels: 0.01 }]
          : []),
      ]);
    const createTile = (error: number, x = 0) => {
      const scene = new Group();
      group.add(scene);
      const getAABB = vi.fn((target: Box3) =>
        target.set(new Vector3(x - 1, -1, -11), new Vector3(x + 1, 1, -9))
      );
      return {
        geometricError: error,
        internal: { loadingState: 4, hasRenderableContent: true },
        engineData: { scene, boundingVolume: { getAABB } },
      } as unknown as Tile;
    };
    const coarse = createTile(0.3);
    const fine = createTile(0.1);
    const outside = createTile(100, 100);
    const cachedCaster = createTile(200);
    Object.assign(f.state.tiles!, { group });
    f.state.tileCameraDemand = demand(true);
    f.state.displayedMeshFrontier = new Set([coarse, fine, outside]);
    f.state.committedMeshCasterFrontier = new Set([
      coarse,
      fine,
      outside,
      cachedCaster,
    ]);
    const telemetry = createTilePipelineTelemetry(() => f.state);
    f.time(1000);
    expect(telemetry.sample()).toMatchObject({
      visibleErrorMaxPx: 30,
      visibleErrorMeanPx: 20,
      visibleOver20Percent: 50,
      visibleOver20Ms: 0,
      visibleErrorKnownTiles: 2,
      visibleErrorUnknownTiles: 0,
    });
    f.time(1500);
    expect(telemetry.sample().visibleOver20Ms).toBe(500);
    const readBounds = (
      coarse as unknown as {
        engineData: { boundingVolume: { getAABB: ReturnType<typeof vi.fn> } };
      }
    ).engineData.boundingVolume.getAABB;
    expect(readBounds).toHaveBeenCalledOnce();
    // Changing solar demand or admission target is not an observer change.
    f.state.tileCameraDemand = createTileCameraDemand([
      { ...view()[0], errorTargetPixels: 6 },
    ]);
    f.time(2000);
    expect(telemetry.sample().visibleOver20Ms).toBe(1000);
    expect(readBounds).toHaveBeenCalledOnce();
    camera.position.x = 0.1;
    f.state.tileCameraDemand = demand();
    f.time(2500);
    expect(telemetry.sample().visibleOver20Ms).toBe(0);
    expect(readBounds).toHaveBeenCalledTimes(2);
    f.state.displayedMeshFrontier = new Set([fine]);
    f.time(3000);
    expect(telemetry.sample()).toMatchObject({
      visibleErrorMaxPx: 10,
      visibleOver20Ms: 0,
    });
    telemetry.dispose();
  });
});
