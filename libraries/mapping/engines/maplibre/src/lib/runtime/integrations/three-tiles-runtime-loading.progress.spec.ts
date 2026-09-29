import { subscribeTileResponses } from "./tile-response-observers";
// @vitest-environment jsdom
import { TilesRenderer } from "3d-tiles-renderer";
import { LRUCache } from "3d-tiles-renderer/core";

import { describe, expect, it, vi } from "vitest";
import { Box3, OrthographicCamera, Vector3 } from "three";
import {
  createTileCameraDemand,
  snapshotTileCameraViews,
  TILE_CAMERA_ROLE,
  TILE_MAIN_OBSERVER_ID,
} from "../../core/tile-camera-demand";

import type {
  RuntimeTile,
  RuntimeTilesRenderer,
} from "./three-tiles-runtime-types";
import {
  MESH_MOTION_DOWNLOAD_CONCURRENCY,
  MESH_MOTION_PARSE_CONCURRENCY,
  MESH_PARSE_BACKLOG_HARD_LIMIT,
} from "./three-tiles-runtime-config";
import { fixture } from "./three-tiles-runtime-loading.test-support";
vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-loading-worker",
  });
});

describe("progress runtime integration", () => {
  it("observes raw response sizes only while diagnostics are enabled, without affecting the response", () => {
    const { state, loading } = fixture();
    const observe = vi.fn();
    const detach = subscribeTileResponses(state.tiles!, observe);
    const response = new Response("data", {
      headers: { "content-length": "4" },
    });
    state.options.diagnostics = false;
    loading.handleWireBytes("https://tiles.test/a.b3dm", response);
    expect(observe).not.toHaveBeenCalled();
    state.options.diagnostics = true;
    loading.handleWireBytes("https://tiles.test/a.b3dm", response);
    expect(observe).toHaveBeenCalledWith({
      url: "https://tiles.test/a.b3dm",
      contentLength: 4,
    });
    expect(response.bodyUsed).toBe(false);
    detach();
    observe.mockClear();
    loading.handleWireBytes("https://tiles.test/a.b3dm", response);
    expect(observe).not.toHaveBeenCalled();
    state.tiles!.dispose();
  });

  it("holds 16 px for an unfinished region and accepts unequal-depth tilted-view tiles", () => {
    const { state, loading } = fixture();
    const tile = (error: number, children: RuntimeTile[] = []) =>
      ({
        refine: "REPLACE",
        children,
        internal: { hasRenderableContent: true, loadingState: 4 },
        traversal: { error, inFrustum: true },
      } as unknown as RuntimeTile);
    const near = tile(12),
      far = tile(17);
    const nearParent = tile(30, [near]);
    const root = tile(80, [nearParent, far]);
    near.parent = nearParent;
    nearParent.parent = far.parent = root;
    Object.assign(state.tiles!, { rootTileset: { root } });
    state.meshInitialBasePassDone = state.meshInitialHandoverDone = true;
    state.effectiveErrorTarget = 16;
    state.displayedMeshFrontier = new Set([near, far]);
    loading.applyErrorTargetPolicy();
    expect(state.effectiveErrorTarget).toBe(16);
    // Projection changes the pixel error, not the two different tree depths.
    far.traversal.error = 15;
    state.shadowView = {
      camera: new OrthographicCamera(),
      shadowMapSize: { width: 512, height: 512 },
    };
    loading.applyErrorTargetPolicy();
    expect(state.effectiveErrorTarget).toBe(16);
    state.meshShadowReserve.ready = true;
    state.shadowReceiverMaskConverged = true;
    state.meshShadowReserve.frontier = new Set([near, far]);
    state.lastMainViewConverged = state.lastActiveViewsConverged = true;
    loading.applyErrorTargetPolicy();
    expect(state.effectiveErrorTarget).toBe(8);
    expect(state.lastMainViewConverged).toBe(false);
    expect(state.lastActiveViewsConverged).toBe(false);
    loading.applyErrorTargetPolicy();
    expect(state.effectiveErrorTarget).toBe(8);
    expect(state.lastMainViewConverged).toBe(false);
    expect(state.lastActiveViewsConverged).toBe(false);
    Object.assign(state.tiles!, { rootTileset: null });
    state.tiles!.dispose();
  });

  it("finishes each published SSE wave while background reserve work remains pending", () => {
    const { state, loading, applyPendingShadowView } = fixture();
    loading.applyErrorTargetPolicy();
    expect(state.effectiveErrorTarget).toBe(64);
    expect(state.meshInitialBasePassDone).toBe(false);
    const root = {
      refine: "REPLACE",
      children: [
        {
          refine: "REPLACE",
          children: [],
          internal: { hasRenderableContent: true, loadingState: 0 },
          traversal: { error: 10 },
        },
      ],
      internal: { hasRenderableContent: true, loadingState: 4 },
      traversal: { error: 40 },
    } as unknown as RuntimeTile;
    Object.assign(state.tiles!, { rootTileset: { root } });
    state.displayedMeshFrontier.add(root);
    state.extentGeometricError = 40;
    state.extentFloorArmed = true;
    state.extentFloorAuditPending = true;
    state.extentFloorPending = 2;
    state.tiles!.loadingTiles.add({} as RuntimeTile);
    loading.applyErrorTargetPolicy();
    expect(state.meshInitialBasePassDone).toBe(true);
    expect(state.meshInitialHandoverDone).toBe(false);
    expect(applyPendingShadowView).toHaveBeenCalledOnce();
    loading.applyErrorTargetPolicy();
    expect(state.effectiveErrorTarget).toBe(32);
    // The published parent now covers the observer at the handover target.
    // Pending reserve audits, payloads and local children do not gate detail.
    root.traversal.error = 18;
    loading.applyErrorTargetPolicy();
    expect(state.meshInitialHandoverDone).toBe(true);
    expect(state.meshInitialReserveSettled).toBe(false);
    expect(state.effectiveErrorTarget).toBe(16);
    expect(state.tiles!.errorTarget).toBe(16);
    expect(state.displayedMeshFrontier.has(root)).toBe(true);
    expect(state.meshDemandSweepPending).toBe(true);
    expect(state.map!.triggerRepaint).toHaveBeenCalled();
    state.extentFloorAuditPending = false;
    state.extentFloorPending = 0;
    loading.applyErrorTargetPolicy();
    expect(state.meshInitialReserveSettled).toBe(false);
    state.tiles!.loadingTiles.clear();
    loading.applyErrorTargetPolicy();
    expect(state.meshInitialReserveSettled).toBe(true);
    expect(applyPendingShadowView).toHaveBeenCalledOnce();
    // Completing 16 px releases 8 px; a 9 px region must still hold that wave.
    state.extentFloorPending = 3;
    root.traversal.error = 9;
    state.lastMainViewConverged = state.lastActiveViewsConverged = true;
    loading.applyErrorTargetPolicy();
    expect(state.effectiveErrorTarget).toBe(8);
    expect(state.lastMainViewConverged).toBe(false);
    expect(state.lastActiveViewsConverged).toBe(false);
    loading.applyErrorTargetPolicy();
    expect(state.effectiveErrorTarget).toBe(8);
    expect(state.lastMainViewConverged).toBe(false);
    expect(state.lastActiveViewsConverged).toBe(false);
    root.traversal.error = 7;
    loading.applyErrorTargetPolicy();
    expect(state.effectiveErrorTarget).toBe(4);
    Object.assign(state.tiles!, { rootTileset: null });
    state.tiles!.dispose();
  });

  it("updates initial and idle targets without rebuilding the tile pool", () => {
    const { state, loading } = fixture();
    const renderer = state.tiles;
    state.meshInitialReserveSettled = true;
    loading.setErrorTarget(6, 12);
    expect(state.tiles).toBe(renderer);
    expect(state.options.baseErrorTargetPixels).toBe(12);
    expect(state.requestedErrorTarget).toBe(6);
    expect(state.effectiveErrorTarget).toBe(64);
    expect(state.meshInitialReserveSettled).toBe(false);
    expect(state.appliedTilesetMinResolutionPx).toBeNaN();
    state.meshInitialReserveSettled = true;
    loading.setErrorTarget(6, 12);
    expect(state.meshInitialReserveSettled).toBe(true);
    loading.setErrorTarget(8, 2);
    expect(state.options.baseErrorTargetPixels).toBe(8);
    state.tiles!.dispose();
  });

  it("does not deadlock idle refinement behind memory-parked reserve requests", () => {
    const { state, loading } = fixture();
    const root = {
      refine: "REPLACE",
      children: [{}],
      internal: { hasRenderableContent: true, loadingState: 4 },
      traversal: { error: 18 },
    } as unknown as RuntimeTile;
    Object.assign(state.tiles!, { rootTileset: { root } });
    state.displayedMeshFrontier.add(root);
    state.extentGeometricError = 40;
    state.extentFloorArmed = true;
    state.extentFloorAuditPending = false;
    state.extentFloorPending = 2;
    state.memoryAdmissionPaused = true;
    state.tiles!.loadingTiles.add({} as RuntimeTile);
    loading.applyErrorTargetPolicy();
    expect(state.meshInitialReserveSettled).toBe(true);
    expect(state.extentFloorPending).toBe(2); // Not a false coverage certificate.
    state.tiles!.loadingTiles.clear();
    Object.assign(state.tiles!, { rootTileset: null });
    state.tiles!.dispose();
  });

  it("releases a pending shadow view once base coverage exists, even if the initial cut never settles", () => {
    const { state, loading, applyPendingShadowView } = fixture();
    state.tiles = new TilesRenderer("mesh.json") as RuntimeTilesRenderer;
    state.tiles.lruCache = new LRUCache();
    // No root, so the view cut can never be proven ready: the add-on would
    // wait for ever without the failsafe.
    state.meshBaseCoverageReady = false;
    loading.applyErrorTargetPolicy();
    expect(state.meshInitialBasePassDone).toBe(false);
    expect(applyPendingShadowView).not.toHaveBeenCalled();
    state.meshBaseCoverageReady = true;
    loading.applyErrorTargetPolicy();
    expect(state.meshInitialBasePassDone).toBe(true);
    expect(applyPendingShadowView).toHaveBeenCalledOnce();
    state.tiles.dispose();
  });

  it.each([
    [false, 10],
    [true, 10],
    [false, Number.NEGATIVE_INFINITY],
    [true, Number.NEGATIVE_INFINITY],
  ] as const)(
    "keeps foreground downloads alive behind parked parses (moving=%s, rank=%s)",
    (moving, rank) => {
      const { state, loading } = fixture(moving);
      state.meshBaseCoverageReady = true;
      const foreground = { cameraPriority: 100 } as RuntimeTile;
      state.tiles!.loadingTiles.add(foreground);
      state.tiles!.parseQueue.items = Array.from(
        { length: MESH_PARSE_BACKLOG_HARD_LIMIT },
        () => ({ cameraPriority: rank } as RuntimeTile)
      );
      const queues = state.tiles!.downloadQueue.originQueues;
      const wake = vi.fn();
      queues.set("https://example.test", { scheduleJobRun: wake } as never);
      state.tiles!.downloadQueue.maxJobsPerOrigin = 0;
      loading.applyRequestConcurrency();
      expect(state.tiles!.downloadQueue.maxJobsPerOrigin).toBe(4);
      expect(wake).toHaveBeenCalledOnce();
      // Current-camera priority changes must be read again, not cached.
      foreground.cameraPriority = 0;
      for (const tile of state.tiles!.parseQueue.items) {
        (tile as RuntimeTile).cameraPriority = 10;
        state.tiles!.loadingTiles.add(tile);
      }
      loading.applyRequestConcurrency();
      expect(state.tiles!.downloadQueue.maxJobsPerOrigin).toBe(0);
      state.loadingPaused = true;
      foreground.cameraPriority = 100;
      loading.applyRequestConcurrency();
      expect(state.tiles!.downloadQueue.maxJobsPerOrigin).toBe(0);
      queues.clear();
      state.tiles!.loadingTiles.clear();
      state.tiles!.parseQueue.items = [];
      state.tiles!.dispose();
    }
  );

  it.each([false, true])(
    "keeps bounded loading alive on continuous pans (ancestors=%s)",
    (ancestors) => {
      const { state, loading } = fixture(true);
      state.tiles!.loadAncestors = ancestors;
      state.map!.isZooming = () => false;
      loading.applyRequestConcurrency();
      expect(state.tiles!.parseQueue.maxJobs).toBe(
        MESH_MOTION_PARSE_CONCURRENCY
      );
      expect(state.tiles!.downloadQueue.maxJobsPerOrigin).toBe(
        MESH_MOTION_DOWNLOAD_CONCURRENCY
      );
      state.tiles!.dispose();
    }
  );

  it("does not serialize coverage downloads during zoom while keeping parsing bounded", () => {
    const { state, loading } = fixture(true);
    state.map!.isZooming = () => true;
    loading.applyRequestConcurrency();
    expect(state.tiles!.downloadQueue.maxJobsPerOrigin).toBe(
      MESH_MOTION_DOWNLOAD_CONCURRENCY
    );
    expect(state.tiles!.parseQueue.maxJobs).toBe(1);
    state.meshBaseCoverageReady = true;
    state.tiles!.parseQueue.items = Array.from(
      { length: MESH_PARSE_BACKLOG_HARD_LIMIT },
      () => ({ cameraPriority: 1 } as RuntimeTile)
    );
    loading.applyRequestConcurrency();
    expect(state.tiles!.downloadQueue.maxJobsPerOrigin).toBe(0);
    state.tiles!.parseQueue.items.length = 0;
    state.loadingPaused = true;
    loading.applyRequestConcurrency();
    expect(state.tiles!.parseQueue.maxJobs).toBe(0);
    state.tiles!.dispose();
  });

  it.each([8, undefined])(
    "releases offscreen families only at first observer idle with handover %s",
    (handoverTarget) => {
      const { state, loading } = fixture(true);
      state.options.handoverErrorTargetPixels = handoverTarget;
      state.meshInitialHandoverDone = false;
      state.meshInitialBasePassDone = true;
      state.memoryErrorTarget = 8;
      state.memoryErrorTargetChangedAt = performance.now();
      state.effectiveErrorTarget = 8;
      // The idle guard must also work before native ancestor mode is disabled.
      state.tiles!.loadAncestors = true;
      const camera = new OrthographicCamera(-50, 50, 50, -50, 0.1, 100);
      state.tileCameraDemand = createTileCameraDemand(
        snapshotTileCameraViews([
          {
            id: TILE_MAIN_OBSERVER_ID,
            camera,
            viewport: [100, 100],
            errorTargetPixels: 8,
            role: TILE_CAMERA_ROLE.RECEIVER,
          },
        ])
      );
      const tile = (x: number, error: number, loaded: boolean): RuntimeTile =>
        ({
          refine: "REPLACE",
          geometricError: error,
          children: [],
          internal: {
            hasRenderableContent: true,
            loadingState: loaded ? 4 : 0,
          },
          traversal: { inFrustum: x === 0, error },
          engineData: {
            boundingVolume: {
              getAABB: (box: Box3) =>
                box.set(new Vector3(x - 1, -1, -11), new Vector3(x + 1, 1, -9)),
            },
          },
        } as unknown as RuntimeTile);
      const parent = tile(0, 40, true);
      const visible = tile(0, 8, true);
      const offscreen = tile(200, 8, false);
      parent.children = [visible, offscreen];
      visible.parent = parent;
      offscreen.parent = parent;
      Object.assign(state.tiles!, { rootTileset: { root: parent } });
      state.displayedMeshFrontier.add(visible);
      const wake = vi.spyOn(state.tiles!, "dispatchEvent");
      try {
        loading.applyErrorTargetPolicy();
        expect(state.meshInitialHandoverDone).toBe(false);
        state.map!.isMoving = () => false;
        state.displayedMeshFrontier.clear();
        loading.applyErrorTargetPolicy();
        expect(state.meshInitialHandoverDone).toBe(false);
        state.displayedMeshFrontier.add(visible);
        state.effectiveErrorTarget = 8;
        state.meshDemandSweepPending = false;
        state.tiles!.stats.downloading = 1;
        wake.mockClear();
        vi.mocked(state.map!.triggerRepaint).mockClear();
        loading.applyErrorTargetPolicy();
        expect(state.meshInitialHandoverDone).toBe(true);
        expect(state.effectiveErrorTarget).toBe(8);
        expect(offscreen.internal.loadingState).toBe(0);
        expect(state.meshDemandSweepPending).toBe(true);
        expect(wake).toHaveBeenCalledWith({ type: "needs-update" });
        expect(state.map!.triggerRepaint).toHaveBeenCalled();
        // Camera motion never returns the normal runtime to partial cold families.
        state.map!.isMoving = () => true;
        loading.applyErrorTargetPolicy();
        expect(state.meshInitialHandoverDone).toBe(true);
      } finally {
        Object.assign(state.tiles!, { rootTileset: null });
        loading.clearErrorTargetTimer();
        state.tiles!.dispose();
      }
    }
  );

  it("keeps the coarse motion policy while the map moves", () => {
    const { state, loading } = fixture(true);
    loading.applyErrorTargetPolicy();
    expect(state.effectiveErrorTarget).toBe(20);
    expect(state.meshDemandSweepPending).toBe(false);
    state.tiles!.dispose();
  });

  it("still respects the memory-adaptive target", () => {
    const { state, loading } = fixture();
    state.meshInitialBasePassDone = true;
    state.memoryErrorTarget = 24;
    state.memoryErrorTargetChangedAt = performance.now();
    loading.applyErrorTargetPolicy();
    expect(state.effectiveErrorTarget).toBe(24);
    loading.clearErrorTargetTimer();
    state.tiles!.dispose();
  });
});
