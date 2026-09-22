// @vitest-environment jsdom
import { TilesRenderer } from "3d-tiles-renderer";
import { LRUCache } from "3d-tiles-renderer/core";
import type { Map as MaplibreMap } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";
import { Box3, OrthographicCamera, Vector3 } from "three";
import {
  createTileCameraDemand,
  snapshotTileCameraViews,
  TILE_CAMERA_ROLE,
  TILE_MAIN_OBSERVER_ID,
} from "../../core/tile-camera-demand";
import { createThreeTilesLoading } from "./three-tiles-runtime-loading";
import { createThreeTilesRuntimeState } from "./three-tiles-runtime-state";
import type {
  RuntimeTile,
  RuntimeTilesRenderer,
} from "./three-tiles-runtime-types";
import {
  MESH_MOTION_DOWNLOAD_CONCURRENCY,
  MESH_MOTION_PARSE_CONCURRENCY,
  MESH_PARSE_BACKLOG_HARD_LIMIT,
} from "./three-tiles-runtime-config";

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-loading-worker",
  });
});

const fixture = (moving = false) => {
  const state = createThreeTilesRuntimeState("mesh", "mesh.json", [7.2, 51.2], {
    providesTerrain: true,
    baseErrorTargetPixels: 20,
  });
  state.tiles = new TilesRenderer("mesh.json") as RuntimeTilesRenderer;
  state.tiles.lruCache = new LRUCache();
  state.normalParseConcurrency = 2;
  state.tiles.loadAncestors = false;
  state.requestedErrorTarget = 4;
  state.memoryErrorTarget = 4;
  state.effectiveErrorTarget = 20;
  state.meshBaseCoverageReady = false;
  state.meshDemandSweepPending = false;
  state.map = {
    isMoving: () => moving,
    triggerRepaint: vi.fn(),
  } as unknown as MaplibreMap;
  const applyPendingShadowView = vi.fn();
  const loading = createThreeTilesLoading(state, {
    requestShadowSelectionRefresh: vi.fn(),
    setShadowSelectionEnabled: vi.fn(),
    applyPendingShadowView,
    isTileInMainView: (tile) => tile.traversal?.inFrustum ?? true,
    getTileObserverDemand: (tile) => ({
      intersects: tile.traversal?.inFrustum ?? true,
      errorPixels: tile.traversal?.error ?? 100,
    }),
    getTileCameraDemand: vi.fn(() => ({
      required: false,
      receiver: false,
      errorRatio: 0,
      priority: Number.NEGATIVE_INFINITY,
    })),
    getTileRequestPriority: (tile) => tile.cameraPriority ?? 1,
    maybeEnableShadowSelection: vi.fn(),
    isTileInPrefetchMargin: () => false,
    getTileCenterness: () => 0,
    getTileScreenError: (tile) => tile.traversal?.error ?? 100,
  });
  return { state, loading, applyPendingShadowView };
};

describe("local refinement progress", () => {
  it("never evicts the configured residual surface, even with a ready coarser replacement or a hidden tab", () => {
    const { state, loading } = fixture();
    const cache = loading.getRuntimeCache()!;
    state.extentFloorArmed = true;
    state.extentGeometricError = 40;
    const parent = {
      refine: "REPLACE",
      parent: null,
      children: [],
      geometricError: 80,
      internal: { hasRenderableContent: true, loadingState: 4 },
      traversal: { inFrustum: false, error: 80 },
    } as unknown as RuntimeTile;
    const floor = {
      ...parent,
      geometricError: 40,
      parent,
      internal: { ...parent.internal },
      children: [],
    } as RuntimeTile;
    const detail = {
      ...floor,
      geometricError: 20,
      parent: floor,
      internal: { ...floor.internal },
      children: [],
    } as RuntimeTile;
    parent.children = [floor];
    floor.children = [detail];
    const disposed: RuntimeTile[] = [];
    for (const tile of [parent, floor, detail]) {
      cache.add(tile, () => {
        tile.internal.loadingState = 0;
        disposed.push(tile);
      });
      cache.setMemoryUsage(tile, 100);
      cache.setLoaded(tile, true);
    }
    cache.markAllUnused();
    cache.minBytesSize = 50;
    cache.maxBytesSize = 150;
    cache.minSize = 0;
    cache.maxSize = 1;
    expect(cache.remove(floor)).toBe(false);
    cache.unloadUnusedContent();
    expect(cache.itemSet.has(floor)).toBe(true);
    expect(disposed).not.toContain(floor);
    loading.wipeCacheWhileHidden();
    expect(cache.itemSet.has(floor)).toBe(true);
    expect(cache.itemSet.has(parent)).toBe(true);
    expect(cache.itemSet.has(detail)).toBe(false);
    // Explicit runtime disposal remains allowed to release the entire scene.
    state.disposed = true;
    expect(cache.remove(floor)).toBe(true);
    state.tiles!.dispose();
  });

  it("guards native batch eviction as well as remove, keeping the published cut and its reserve", () => {
    const { state, loading } = fixture();
    const cache = loading.getRuntimeCache()!;
    const parent = {
      refine: "REPLACE",
      children: [],
      parent: null,
      internal: { hasRenderableContent: true, loadingState: 4 },
      traversal: { inFrustum: false, error: 100 },
    } as unknown as RuntimeTile;
    const child = {
      ...parent,
      parent,
      internal: { ...parent.internal },
    } as RuntimeTile;
    parent.children = [child];
    const dispose = vi.fn();
    for (const tile of [parent, child]) {
      cache.add(tile, () => {
        tile.internal.loadingState = 0;
        dispose(tile);
      });
      cache.setMemoryUsage(tile, 100);
      cache.setLoaded(tile, true);
    }
    cache.minBytesSize = 50;
    cache.maxBytesSize = 150;
    cache.minSize = 0;
    cache.maxSize = 1;
    cache.markAllUnused();
    state.displayedMeshFrontier.add(child);
    cache.unloadUnusedContent(); // Upstream bypasses remove() here.
    expect(dispose).not.toHaveBeenCalled();
    expect(cache.itemList).toHaveLength(2);
    state.displayedMeshFrontier.clear();
    state.displayedMeshFrontier.add(parent); // Publish replacement first.
    cache.unloadUnusedContent();
    expect(dispose).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledWith(child);
    expect(cache.itemList).toEqual([parent]);
    loading.wipeCacheWhileHidden();
    state.tiles!.dispose();
  });

  it("keeps reusable tiles above the soft watermark while the hard budget has room", () => {
    const { state, loading } = fixture();
    const cache = loading.getRuntimeCache()!;
    const tile = {
      internal: { loadingState: 4, hasRenderableContent: true },
    } as RuntimeTile;
    const dispose = vi.fn();
    cache.add(tile, dispose);
    cache.setMemoryUsage(tile, 100);
    cache.setLoaded(tile, true);
    cache.minBytesSize = 50;
    cache.maxBytesSize = 200;
    cache.markAllUnused();
    cache.unloadUnusedContent();
    expect(dispose).not.toHaveBeenCalled();
    loading.wipeCacheWhileHidden();
    state.tiles!.dispose();
  });

  it("preserves unpresented residual coverage through pan and zoom-out without an idle-ring flag", () => {
    const { state, loading } = fixture(true);
    const cache = loading.getRuntimeCache()!;
    const reserve = {
      refine: "REPLACE",
      children: [],
      parent: null,
      internal: { hasRenderableContent: true, loadingState: 4 },
      traversal: { inFrustum: false, error: 100 },
    } as unknown as RuntimeTile;
    const dispose = vi.fn(() => {
      reserve.internal.loadingState = 0;
    });
    cache.add(reserve, dispose);
    expect(cache.remove(reserve)).toBe(false);
    reserve.traversal.inFrustum = true; // Zoom-out exposes the resident reserve.
    expect(cache.remove(reserve)).toBe(false);
    const parent = {
      ...reserve,
      children: [reserve],
      internal: { ...reserve.internal },
      traversal: { inFrustum: true, error: 10 },
    } as RuntimeTile;
    reserve.parent = parent;
    cache.add(parent, vi.fn());
    state.displayedMeshFrontier.add(parent);
    state.displayedMeshFrontier.add(reserve);
    // Motion admission allows 20px, but existing detail is retained at 4px.
    expect(cache.remove(reserve)).toBe(false);
    parent.traversal.error = 3; // Coarsening is safe after a further zoom-out.
    expect(cache.remove(reserve)).toBe(true);
    expect(dispose).toHaveBeenCalledOnce();
    expect(cache.remove(parent)).toBe(false); // Never erase the last coverage.
    loading.wipeCacheWhileHidden();
    state.tiles!.dispose();
  });

  it("releases the requested target after observer handover while reserve work remains pending", () => {
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
    expect(state.effectiveErrorTarget).toBe(20);
    // The published parent now covers the observer at the handover target.
    // Pending reserve audits, payloads and local children do not gate detail.
    root.traversal.error = 18;
    loading.applyErrorTargetPolicy();
    expect(state.meshInitialHandoverDone).toBe(true);
    expect(state.meshInitialReserveSettled).toBe(false);
    expect(state.effectiveErrorTarget).toBe(4);
    expect(state.tiles!.errorTarget).toBe(4);
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
    // Later reserve work does not restart a global quality stage.
    state.extentFloorPending = 3;
    root.traversal.error = 9;
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

  it("keeps resident reserve coverage until a resident parent replaces it, without pinning pending work", () => {
    const { state, loading } = fixture();
    const cache = loading.getRuntimeCache()!;
    const tile = {
      refine: "REPLACE",
      children: [],
      parent: null,
      idleRing: true,
      internal: { hasRenderableContent: true, loadingState: 4 },
      traversal: { inFrustum: false, error: 100 },
    } as unknown as RuntimeTile;
    const removed = vi.fn();
    cache.add(tile, removed);
    expect(cache.remove(tile)).toBe(false);
    expect(removed).not.toHaveBeenCalled();
    const parent = {
      ...tile,
      children: [tile],
      internal: { ...tile.internal },
    } as RuntimeTile;
    tile.parent = parent;
    cache.add(parent, vi.fn());
    let textured = false;
    state.tiles!.registerPlugin({
      name: "CARMA_DEFERRED_TILE_MATERIALS",
      isReady: () => textured,
    });
    expect(cache.remove(tile)).toBe(false);
    textured = true;
    expect(cache.remove(tile)).toBe(true);
    expect(removed).toHaveBeenCalledOnce();
    // It cannot cascade into erasing the last replacement either.
    expect(cache.remove(parent)).toBe(false);
    const pending = {
      ...tile,
      internal: { ...tile.internal, loadingState: 2 },
    } as RuntimeTile;
    cache.add(pending, vi.fn());
    expect(cache.remove(pending)).toBe(true);
    // Deliberate teardown is exempt from persistent coverage.
    loading.wipeCacheWhileHidden();
    expect(cache.itemList).toHaveLength(0);
    state.tiles!.dispose();
  });

  it("keeps queued refinement support out of the settled-demand sweep", () => {
    const { state, loading } = fixture();
    const cache = loading.getRuntimeCache()!;
    state.viewFrustumsReady = true;
    const offscreenSibling = (uri: string) =>
      ({
        refine: "REPLACE",
        parent: null,
        children: [],
        geometricError: 20,
        content: { uri },
        engineData: { boundingVolume: { getAABB: () => undefined } },
        internal: { hasRenderableContent: true, loadingState: 1 },
        traversal: { inFrustum: false, error: 100 },
      } as unknown as RuntimeTile);
    const support = offscreenSibling("support.b3dm");
    const stale = offscreenSibling("stale.b3dm");
    for (const tile of [support, stale]) {
      cache.add(tile, vi.fn());
      cache.setMemoryUsage(tile, 100);
      state.tiles!.loadingTiles.add(tile);
    }
    cache.markAllUnused();
    // The sweep releases only under memory pressure.
    cache.maxBytesSize = 150;
    // The publication walk queues the offscreen siblings of an incomplete
    // REPLACE family. That membership is the only difference between the two
    // tiles here, and the traversal re-requests whatever the sweep cancels.
    state.meshRefinementSupport.add(support);
    state.meshDemandSweepPending = true;
    loading.sweepSettledMeshDemand();
    expect(cache.itemSet.has(support)).toBe(true);
    expect(cache.itemSet.has(stale)).toBe(false);
    state.tiles!.loadingTiles.clear();
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
