import { Box3, Group, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  snapshotTileCameraViews,
  TILE_CAMERA_ROLE,
  TILE_CAMERA_PRIORITY,
} from "../../core/tile-camera-demand";
import { createThreeTilesCascade } from "./three-tiles-runtime-cascade";
import { createThreeTilesMotionPrefetch } from "./three-tiles-motion-prefetch";
import type { RuntimeTile } from "./three-tiles-runtime-types";
import {
  LOADED_LOADING_STATE,
  LOADING_LOADING_STATE,
  PARSING_LOADING_STATE,
  QUEUED_LOADING_STATE,
  UNLOADED_LOADING_STATE,
} from "./three-tiles-runtime-vendor";

const tile = (
  loaded = false,
  children: RuntimeTile[] = [],
  metadata = false
): RuntimeTile => {
  const result = {
    refine: "REPLACE",
    geometricError: 1,
    internal: {
      hasContent: true,
      hasRenderableContent: !metadata,
      hasUnrenderableContent: metadata,
      loadingState: loaded ? LOADED_LOADING_STATE : UNLOADED_LOADING_STATE,
    },
    children,
    parent: null,
    engineData: {
      boundingVolume: {
        getAABB: (target: Box3) =>
          target.set(new Vector3(-1, -1, -12), new Vector3(1, 1, -10)),
      },
    },
  } as unknown as RuntimeTile;
  children.forEach((child) => {
    child.parent = result;
  });
  return result;
};

const createPrefetchFixture = (root: RuntimeTile) => {
  const work = new Map<RuntimeTile, () => void>();
  const tiles = {
    root,
    loadingTiles: new Set<RuntimeTile>(),
    visibleTiles: new Set<RuntimeTile>(),
    group: new Group(),
    stats: { queued: 0, downloading: 0, parsing: 0 },
    lruCache: {
      cachedBytes: 0,
      minBytesSize: 1000,
      remove: vi.fn((entry: RuntimeTile) => {
        entry.internal.loadingState = UNLOADED_LOADING_STATE;
        work.get(entry)?.();
      }),
    },
    downloadQueue: { maxJobsPerOrigin: 4 },
    parseQueue: { maxJobs: 2 },
    ensureChildrenArePreprocessed: vi.fn(),
    markTileUsed: vi.fn(),
    requestTileContents: vi.fn((entry: RuntimeTile) => {
      entry.internal.loadingState = LOADING_LOADING_STATE;
      tiles.stats.downloading += 1;
      return new Promise<void>((resolve) => {
        work.set(entry, () => {
          tiles.stats.downloading -= 1;
          work.delete(entry);
          resolve();
        });
      });
    }),
  };
  const state = {
    options: {},
    tiles,
    requestedErrorTarget: 2,
    effectiveErrorTarget: 2,
    memoryErrorTarget: 2,
    meshRefinementSupport: new Set<RuntimeTile>(),
    residentAncestors: new Set<RuntimeTile>(),
    extentGeometricError: 40,
    extentFloorArmed: false,
    shadowView: null,
    shadowSelectionEnabled: false,
    shadowReceiverMask: null,
    map: { triggerRepaint: vi.fn(), isZooming: vi.fn(() => false) },
  };
  const dependencies = {
    isTileInPrefetchMargin: () => false,
    applyTileDeferral: vi.fn(),
    applyEffectiveErrorTarget: vi.fn(),
    initialEffectiveErrorTarget: () => 2,
    getTileScreenError: vi.fn(() => 2),
    isTileInMainView: vi.fn((_entry: RuntimeTile) => true),
    getTileCameraDemand: vi.fn((_entry: RuntimeTile) => ({
      required: false,
      receiver: false,
      errorRatio: 0,
      priority: Number.NEGATIVE_INFINITY,
    })),
    getTileRequestPriority: (entry: RuntimeTile): number =>
      Math.max(
        dependencies.isTileInMainView(entry)
          ? TILE_CAMERA_PRIORITY.PRIMARY
          : Number.NEGATIVE_INFINITY,
        dependencies.getTileCameraDemand(entry).required
          ? dependencies.getTileCameraDemand(entry).priority ??
              TILE_CAMERA_PRIORITY.PRIMARY
          : Number.NEGATIVE_INFINITY
      ),
  };
  const cascade = createThreeTilesCascade(
    state as unknown as Parameters<typeof createThreeTilesCascade>[0],
    dependencies
  );
  const camera = new PerspectiveCamera(60, 1, 1, 100);
  const [snapshot] = snapshotTileCameraViews([
    {
      id: "zoom-focus",
      camera,
      viewport: [128, 128],
      errorTargetPixels: 1,
      role: TILE_CAMERA_ROLE.GEOMETRY,
    },
  ]);
  const controller = new AbortController();
  const start = (levels: 1 | 2 = 2) =>
    cascade.prefetchZoom(
      {
        camera: snapshot,
        lngLat: [7.15, 51.25],
        levels,
      },
      controller.signal
    );
  const complete = async (entry: RuntimeTile) => {
    expect(work.has(entry)).toBe(true);
    entry.internal.loadingState = LOADED_LOADING_STATE;
    work.get(entry)!();
    // Native request promises and their queue cleanup settle before admission
    // is observed in the next task, just as a completed payload event does.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  };
  return { tiles, state, dependencies, controller, start, complete, snapshot };
};

describe("bounded future-view requests", () => {
  it("includes the primary observer when adopting a future request after a pan", async () => {
    const child = tile();
    const f = createPrefetchFixture(child);
    const p = createThreeTilesMotionPrefetch(
      {
        ...f.state,
        options: { providesTerrain: true },
        meshBaseCoverageReady: true,
      } as never,
      f.dependencies
    );
    try {
      p.setView(f.snapshot, "path", 1000);
      await new Promise((resolve) => setTimeout(resolve, 5));
      f.dependencies.getTileCameraDemand.mockImplementation(((
        _tile: RuntimeTile,
        includeObserver: boolean
      ) => ({
        required: includeObserver,
        receiver: false,
        errorRatio: 2,
        priority: includeObserver ? 1 : -Infinity,
      })) as never);
      p.clear();
      expect(f.tiles.lruCache.remove).not.toHaveBeenCalled();
      expect(p.needed(child)).toBe(true);
      expect(f.dependencies.getTileCameraDemand).toHaveBeenLastCalledWith(
        child,
        true
      );
    } finally {
      p.dispose();
    }
  });

  it("does not evict a completed prefetch when its expiry beats promise cleanup", async () => {
    const child = tile();
    const f = createPrefetchFixture(child);
    const p = createThreeTilesMotionPrefetch(
      {
        ...f.state,
        options: { providesTerrain: true },
        meshBaseCoverageReady: true,
      } as never,
      f.dependencies
    );
    try {
      p.setView(f.snapshot, "path", 1000);
      await new Promise((resolve) => setTimeout(resolve, 5));
      child.internal.loadingState = LOADED_LOADING_STATE;
      p.clear();
      expect(f.tiles.lruCache.remove).not.toHaveBeenCalled();
      expect(child.motionPrefetch).toBe(false);
      expect(p.getStats().pending).toBe(0);
      expect(f.state.map.triggerRepaint).not.toHaveBeenCalled();
    } finally {
      p.dispose();
    }
  });

  it("does not spend the eviction reserve on prediction even below the hard ceiling", async () => {
    const f = createPrefetchFixture(tile());
    Object.assign(f.tiles.lruCache, {
      cachedBytes: 900,
      minBytesSize: 1000,
      maxBytesSize: 2000,
    });
    const p = createThreeTilesMotionPrefetch(
      {
        ...f.state,
        options: { providesTerrain: true },
        meshBaseCoverageReady: true,
      } as never,
      f.dependencies
    );
    try {
      p.setView(f.snapshot, "path", 1000);
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(f.tiles.requestTileContents).not.toHaveBeenCalled();
      expect(f.tiles.lruCache.remove).not.toHaveBeenCalled();
    } finally {
      p.dispose();
    }
  });

  it("does not poll ring refinement when memory leaves no room for another ring", () => {
    vi.useFakeTimers();
    const f = createPrefetchFixture(tile());
    const dispatchEvent = vi.fn();
    Object.assign(f.tiles, { dispatchEvent, loadAncestors: false });
    Object.assign(f.tiles.lruCache, { cachedBytes: 1000 });
    const c = createThreeTilesCascade(
      {
        ...f.state,
        meshBaseCoverageReady: true,
        extentFloorPending: 0,
        ringRefinePasses: 0,
      } as never,
      f.dependencies
    );
    try {
      c.scheduleCascadeTick();
      vi.advanceTimersByTime(10000);
      expect(dispatchEvent).not.toHaveBeenCalled();
    } finally {
      c.clearCascadeTick();
      c.motionPrefetch.dispose();
      vi.useRealTimers();
    }
  });

  it("backs off optional retries after preemption, without blocking live adoption", async () => {
    const child = tile();
    const f = createPrefetchFixture(child);
    const p = createThreeTilesMotionPrefetch(
      {
        ...f.state,
        options: { providesTerrain: true },
        meshBaseCoverageReady: true,
      } as never,
      f.dependencies
    );
    try {
      p.setView(f.snapshot, "path", 1000);
      await new Promise((resolve) => setTimeout(resolve, 5));
      f.tiles.lruCache.remove(child);
      await new Promise((resolve) => setTimeout(resolve, 5));
      p.setView(f.snapshot, "path", 1000);
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(f.tiles.requestTileContents).toHaveBeenCalledTimes(1);
      expect(p.getStats().cancelled).toBe(1);
      f.dependencies.getTileCameraDemand.mockReturnValue({
        required: true,
        receiver: true,
        errorRatio: 2,
        priority: 1,
      });
      expect(p.needed(child)).toBe(true);
    } finally {
      p.dispose();
    }
  });

  it("does not request ahead before base coverage; uses the same pool and whole family afterwards", async () => {
    const children = [tile(), tile()];
    const root = tile(true, children);
    root.geometricError = 100;
    const f = createPrefetchFixture(root);
    const state = {
      ...f.state,
      options: { providesTerrain: true },
      meshBaseCoverageReady: false,
    };
    const p = createThreeTilesMotionPrefetch(state as never, f.dependencies);
    try {
      p.setView(f.snapshot, "path", 1000);
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(f.tiles.requestTileContents).not.toHaveBeenCalled();
      state.meshBaseCoverageReady = true;
      p.setView(f.snapshot, "path", 1000);
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(
        f.tiles.requestTileContents.mock.calls.map(([child]) => child)
      ).toEqual(children);
      expect(p.getStats().pending).toBe(2);
      expect(f.tiles.visibleTiles.size).toBe(0);
      expect(p.needed(children[0])).toBe(true);
    } finally {
      p.dispose();
    }
  });

  it("expires even without another rendered frame and preserves work adopted by the live view", async () => {
    const child = tile();
    const f = createPrefetchFixture(child);
    const p = createThreeTilesMotionPrefetch(
      {
        ...f.state,
        options: { providesTerrain: true },
        meshBaseCoverageReady: true,
      } as never,
      f.dependencies
    );
    try {
      p.setView(f.snapshot, "path", 30);
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(p.getStats().pending).toBe(1);
      f.dependencies.getTileCameraDemand.mockReturnValue({
        required: true,
        receiver: true,
        errorRatio: 2,
        priority: 1,
      });
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(p.getStats().views).toBe(0);
      expect(f.tiles.lruCache.remove).not.toHaveBeenCalled();
      f.dependencies.getTileCameraDemand.mockReturnValue({
        required: false,
        receiver: false,
        errorRatio: 0,
        priority: -Infinity,
      });
      p.setView(null, "path");
      expect(f.tiles.lruCache.remove).toHaveBeenCalledWith(child);
    } finally {
      p.dispose();
    }
  });

  it("does not allocate speculative tiles under memory pressure", async () => {
    const f = createPrefetchFixture(tile());
    f.tiles.lruCache.cachedBytes = 900;
    const p = createThreeTilesMotionPrefetch(
      {
        ...f.state,
        options: { providesTerrain: true },
        meshBaseCoverageReady: true,
      } as never,
      f.dependencies
    );
    try {
      p.setView(f.snapshot, "path", 1000);
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(f.tiles.requestTileContents).not.toHaveBeenCalled();
    } finally {
      p.dispose();
    }
  });
});

describe("3D Tiles spare-capacity zoom prefetch", () => {
  it("preempts active offscreen support downloads for waiting viewport work but retains parsed buffers", () => {
    const fixture = createPrefetchFixture(tile());
    fixture.state.options = { providesTerrain: true };
    const visible = tile();
    visible.internal.loadingState = QUEUED_LOADING_STATE;
    const downloading = tile();
    downloading.internal.loadingState = LOADING_LOADING_STATE;
    const parsing = tile();
    parsing.internal.loadingState = PARSING_LOADING_STATE;
    fixture.state.meshRefinementSupport.add(downloading);
    fixture.state.meshRefinementSupport.add(parsing);
    [visible, downloading, parsing].forEach((t) =>
      fixture.tiles.loadingTiles.add(t)
    );
    fixture.dependencies.isTileInMainView.mockImplementation(
      (t) => t === visible
    );
    const cascade = createThreeTilesCascade(
      fixture.state as unknown as Parameters<typeof createThreeTilesCascade>[0],
      fixture.dependencies
    );
    cascade.abortStaleDownloads();
    expect(
      fixture.tiles.lruCache.remove.mock.calls.map(([entry]) => entry)
    ).toEqual([downloading]);
    expect(cascade.isTileRequestNeeded(downloading)).toBe(true);
    expect(parsing.internal.loadingState).toBe(PARSING_LOADING_STATE);
  });

  it("discards a coarse pending REPLACE payload already covered by drawn children", () => {
    const children = [tile(true), tile(true)];
    children.forEach((child) => {
      child.engineData!.scene = new Group();
    });
    const coarse = tile(false, children);
    coarse.internal.loadingState = PARSING_LOADING_STATE;
    const fixture = createPrefetchFixture(coarse);
    fixture.state.options = { providesTerrain: true };
    children.forEach((t) => fixture.tiles.visibleTiles.add(t));
    fixture.tiles.loadingTiles.add(coarse);
    const cascade = createThreeTilesCascade(
      fixture.state as unknown as Parameters<typeof createThreeTilesCascade>[0],
      fixture.dependencies
    );
    cascade.abortStaleDownloads();
    expect(fixture.tiles.lruCache.remove).toHaveBeenCalledWith(coarse);
    expect(fixture.tiles.visibleTiles.size).toBe(2);
  });

  it("does not preempt an offscreen fetch required by another camera", () => {
    const fixture = createPrefetchFixture(tile());
    fixture.state.options = { providesTerrain: true };
    const visible = tile();
    visible.internal.loadingState = QUEUED_LOADING_STATE;
    const otherCamera = tile();
    otherCamera.internal.loadingState = LOADING_LOADING_STATE;
    fixture.tiles.loadingTiles.add(visible);
    fixture.tiles.loadingTiles.add(otherCamera);
    fixture.dependencies.isTileInMainView.mockImplementation(
      (t) => t === visible
    );
    fixture.dependencies.getTileCameraDemand.mockImplementation((t) => ({
      required: t === otherCamera,
      receiver: false,
      errorRatio: 2,
      priority: TILE_CAMERA_PRIORITY.PRIMARY,
    }));
    const cascade = createThreeTilesCascade(
      fixture.state as unknown as Parameters<typeof createThreeTilesCascade>[0],
      fixture.dependencies
    );
    cascade.abortStaleDownloads();
    expect(fixture.tiles.lruCache.remove).not.toHaveBeenCalled();
  });

  it.each([
    [TILE_CAMERA_PRIORITY.SECONDARY, TILE_CAMERA_PRIORITY.PRIMARY, true],
    [TILE_CAMERA_PRIORITY.PRIMARY, TILE_CAMERA_PRIORITY.FOCUS, true],
    [TILE_CAMERA_PRIORITY.FOCUS, TILE_CAMERA_PRIORITY.PRIMARY, false],
  ])(
    "preempts rank %s fetch for waiting rank %s only when it is lower (%s)",
    (activePriority, waitingPriority, preempted) => {
      const fixture = createPrefetchFixture(tile());
      fixture.state.options = { providesTerrain: true };
      fixture.dependencies.isTileInMainView.mockReturnValue(false);
      const active = tile();
      active.internal.loadingState = LOADING_LOADING_STATE;
      const waiting = tile();
      waiting.internal.loadingState = QUEUED_LOADING_STATE;
      const parsed = tile();
      parsed.internal.loadingState = PARSING_LOADING_STATE;
      const loaded = tile(true);
      [active, waiting, parsed, loaded].forEach((entry) =>
        fixture.tiles.loadingTiles.add(entry)
      );
      fixture.dependencies.getTileCameraDemand.mockImplementation((entry) => ({
        required: true,
        receiver: true,
        errorRatio: 2,
        priority: entry === waiting ? waitingPriority : activePriority,
      }));
      const cascade = createThreeTilesCascade(
        fixture.state as unknown as Parameters<
          typeof createThreeTilesCascade
        >[0],
        fixture.dependencies
      );
      cascade.abortStaleDownloads();
      expect(
        fixture.tiles.lruCache.remove.mock.calls.map(([entry]) => entry)
      ).toEqual(preempted ? [active] : []);
      expect(cascade.isTileRequestNeeded(active)).toBe(true);
      expect(parsed.internal.loadingState).toBe(PARSING_LOADING_STATE);
      expect(loaded.internal.loadingState).toBe(LOADED_LOADING_STATE);
    }
  );
  it("uses the installed native request-state values", () => {
    expect([
      QUEUED_LOADING_STATE,
      LOADING_LOADING_STATE,
      PARSING_LOADING_STATE,
    ]).toEqual([1, 2, 3]);
  });

  it.each([
    ["queued", QUEUED_LOADING_STATE],
    ["downloading", LOADING_LOADING_STATE],
    ["parsing", PARSING_LOADING_STATE],
  ] as const)(
    "cancels off-view %s work back to a retryable state",
    (_phase, state) => {
      const parent = tile(true);
      const obsolete = tile();
      obsolete.parent = parent;
      obsolete.internal.loadingState = state;
      const fixture = createPrefetchFixture(parent);
      fixture.tiles.loadingTiles.add(obsolete);
      fixture.dependencies.isTileInMainView.mockReturnValue(false);

      const cascade = createThreeTilesCascade(
        fixture.state as unknown as Parameters<
          typeof createThreeTilesCascade
        >[0],
        fixture.dependencies
      );
      cascade.abortStaleDownloads();

      expect(fixture.tiles.lruCache.remove).toHaveBeenCalledWith(obsolete);
      expect(obsolete.internal.loadingState).toBe(UNLOADED_LOADING_STATE);
    }
  );

  it("retains current-target coverage while cancelling an irrelevant pending tile", () => {
    const demanded = tile(true);
    const relevant = tile();
    const irrelevant = tile();
    demanded.children = [relevant, irrelevant];
    relevant.parent = demanded;
    irrelevant.parent = demanded;
    relevant.internal.loadingState = LOADING_LOADING_STATE;
    irrelevant.internal.loadingState = LOADING_LOADING_STATE;
    const fixture = createPrefetchFixture(demanded);
    fixture.state.requestedErrorTarget = 4;
    fixture.state.effectiveErrorTarget = 20;
    fixture.tiles.loadingTiles.add(relevant);
    fixture.tiles.loadingTiles.add(irrelevant);
    fixture.dependencies.isTileInMainView.mockImplementation(
      (entry) => entry === relevant
    );
    fixture.dependencies.getTileScreenError.mockImplementation((entry) =>
      entry === demanded ? 10 : 0
    );

    const cascade = createThreeTilesCascade(
      fixture.state as unknown as Parameters<typeof createThreeTilesCascade>[0],
      fixture.dependencies
    );
    cascade.abortStaleDownloads();

    expect(fixture.tiles.lruCache.remove).toHaveBeenCalledTimes(1);
    expect(fixture.tiles.lruCache.remove).toHaveBeenCalledWith(irrelevant);
    expect(relevant.internal.loadingState).toBe(LOADING_LOADING_STATE);
  });

  it("cancels in-view refinement made obsolete by a coarser requested target", () => {
    const parent = tile(true);
    const tooFine = tile();
    tooFine.parent = parent;
    tooFine.internal.loadingState = LOADING_LOADING_STATE;
    const fixture = createPrefetchFixture(parent);
    fixture.state.requestedErrorTarget = 20;
    fixture.tiles.loadingTiles.add(tooFine);
    fixture.dependencies.isTileInMainView.mockReturnValue(true);
    fixture.dependencies.getTileScreenError.mockReturnValue(10);
    const cascade = createThreeTilesCascade(
      fixture.state as unknown as Parameters<typeof createThreeTilesCascade>[0],
      fixture.dependencies
    );

    cascade.abortStaleDownloads();

    expect(fixture.tiles.lruCache.remove).toHaveBeenCalledWith(tooFine);
  });

  it("cancels finer in-view work against the actual coarser memory target", () => {
    const parent = tile(true);
    const tooFine = tile();
    tooFine.parent = parent;
    tooFine.internal.loadingState = LOADING_LOADING_STATE;
    const fixture = createPrefetchFixture(parent);
    fixture.state.requestedErrorTarget = 4;
    fixture.state.effectiveErrorTarget = 4;
    fixture.state.memoryErrorTarget = 20;
    fixture.tiles.loadingTiles.add(tooFine);
    fixture.dependencies.isTileInMainView.mockReturnValue(true);
    fixture.dependencies.getTileScreenError.mockReturnValue(10);
    const cascade = createThreeTilesCascade(
      fixture.state as unknown as Parameters<typeof createThreeTilesCascade>[0],
      fixture.dependencies
    );

    cascade.abortStaleDownloads();

    expect(fixture.tiles.lruCache.remove).toHaveBeenCalledWith(tooFine);
  });

  it("does not treat an additive ancestor as replacement coverage", () => {
    const parent = tile(true);
    parent.refine = "ADD";
    const pending = tile();
    pending.parent = parent;
    pending.internal.loadingState = LOADING_LOADING_STATE;
    const fixture = createPrefetchFixture(parent);
    fixture.state.requestedErrorTarget = 20;
    fixture.tiles.loadingTiles.add(pending);
    fixture.dependencies.isTileInMainView.mockReturnValue(true);
    fixture.dependencies.getTileScreenError.mockReturnValue(1);
    const cascade = createThreeTilesCascade(
      fixture.state as unknown as Parameters<typeof createThreeTilesCascade>[0],
      fixture.dependencies
    );

    cascade.abortStaleDownloads();

    expect(fixture.tiles.lruCache.remove).not.toHaveBeenCalled();
  });

  it.each([
    [2, false],
    [1, true],
  ] as const)(
    "uses other-camera parent error ratio %s as a strict refinement boundary",
    (errorRatio, cancelled) => {
      const parent = tile(true);
      const pending = tile();
      pending.parent = parent;
      pending.internal.loadingState = LOADING_LOADING_STATE;
      const fixture = createPrefetchFixture(parent);
      fixture.tiles.loadingTiles.add(pending);
      fixture.dependencies.isTileInMainView.mockReturnValue(false);
      fixture.dependencies.getTileCameraDemand.mockImplementation((entry) => ({
        required: entry === pending,
        receiver: false,
        errorRatio: entry === parent ? errorRatio : 2,
        priority: TILE_CAMERA_PRIORITY.PRIMARY,
      }));
      const cascade = createThreeTilesCascade(
        fixture.state as unknown as Parameters<
          typeof createThreeTilesCascade
        >[0],
        fixture.dependencies
      );

      cascade.abortStaleDownloads();

      expect(fixture.tiles.lruCache.remove).toHaveBeenCalledTimes(
        cancelled ? 1 : 0
      );
    }
  );

  it("protects armed floor and replacement-support work", () => {
    const root = tile(true);
    const floor = tile();
    const support = tile();
    floor.geometricError = 40;
    floor.internal.loadingState = LOADING_LOADING_STATE;
    support.internal.loadingState = PARSING_LOADING_STATE;
    const fixture = createPrefetchFixture(root);
    fixture.state.extentFloorArmed = true;
    fixture.state.meshRefinementSupport.add(support);
    fixture.tiles.loadingTiles.add(floor);
    fixture.tiles.loadingTiles.add(support);
    fixture.dependencies.isTileInMainView.mockReturnValue(false);
    const cascade = createThreeTilesCascade(
      fixture.state as unknown as Parameters<typeof createThreeTilesCascade>[0],
      fixture.dependencies
    );

    cascade.abortStaleDownloads();

    expect(fixture.tiles.lruCache.remove).not.toHaveBeenCalled();
  });

  it.each(["idle-ring", "resident-ancestor"] as const)(
    "keeps %s background work only at rest after base coverage",
    (kind) => {
      const background = tile();
      background.internal.loadingState = LOADING_LOADING_STATE;
      if (kind === "idle-ring") background.idleRing = true;
      const fixture = createPrefetchFixture(tile(true));
      fixture.state.meshBaseCoverageReady = true;
      if (kind === "resident-ancestor")
        fixture.state.residentAncestors.add(background);
      fixture.tiles.loadingTiles.add(background);
      fixture.dependencies.isTileInMainView.mockReturnValue(false);
      const cascade = createThreeTilesCascade(
        fixture.state as unknown as Parameters<
          typeof createThreeTilesCascade
        >[0],
        fixture.dependencies
      );

      cascade.abortStaleDownloads();
      expect(fixture.tiles.lruCache.remove).not.toHaveBeenCalled();

      Object.assign(fixture.state.map, { isMoving: () => true });
      cascade.abortStaleDownloads();
      expect(fixture.tiles.lruCache.remove).toHaveBeenCalledWith(background);
    }
  );

  it("never evicts already loaded content during stale-work cancellation", () => {
    const loaded = tile(true);
    const fixture = createPrefetchFixture(loaded);
    fixture.tiles.loadingTiles.add(loaded);
    fixture.dependencies.isTileInMainView.mockReturnValue(false);
    const cascade = createThreeTilesCascade(
      fixture.state as unknown as Parameters<typeof createThreeTilesCascade>[0],
      fixture.dependencies
    );

    cascade.abortStaleDownloads();

    expect(fixture.tiles.lruCache.remove).not.toHaveBeenCalled();
    expect(loaded.internal.loadingState).toBe(LOADED_LOADING_STATE);
  });

  it.each([1, 2] as const)(
    "admits one native request at a time and no more than %i payload levels",
    async (levels) => {
      const third = tile();
      const second = tile(false, [third]);
      const first = tile(false, [second]);
      const sibling = tile();
      const root = tile(true, [first, sibling]);
      const fixture = createPrefetchFixture(root);
      const task = fixture.start(levels);
      expect(
        fixture.tiles.requestTileContents.mock.calls.map(([entry]) => entry)
      ).toEqual([first]);
      expect(first.zoomPrefetch).toBe(true);
      await fixture.complete(first);
      expect(
        fixture.tiles.requestTileContents.mock.calls.map(([entry]) => entry)
      ).toEqual([first, sibling]);
      expect(first.zoomPrefetch).toBe(false);
      await fixture.complete(sibling);
      if (levels === 2) await fixture.complete(second);
      await task;
      expect(
        fixture.tiles.requestTileContents.mock.calls.map(([entry]) => entry)
      ).toEqual(levels === 2 ? [first, sibling, second] : [first, sibling]);
      expect(third.internal.loadingState).toBe(UNLOADED_LOADING_STATE);
      expect(fixture.tiles.markTileUsed).toHaveBeenCalledTimes(
        levels === 2 ? 3 : 2
      );
      expect(fixture.tiles.stats.downloading).toBe(0);
    }
  );

  it("counts payload levels, not intervening metadata nodes", async () => {
    const third = tile();
    const second = tile(false, [third]);
    const metadata = tile(true, [second], true);
    const first = tile(false, [metadata]);
    const fixture = createPrefetchFixture(tile(true, [first]));
    const task = fixture.start();
    await fixture.complete(first);
    await fixture.complete(second);
    await task;
    expect(
      fixture.tiles.requestTileContents.mock.calls.map(([entry]) => entry)
    ).toEqual([first, second]);
    expect(third.internal.loadingState).toBe(UNLOADED_LOADING_STATE);
  });

  it.each(["queued", "downloading", "parsing"] as const)(
    "never competes with foreground %s work",
    async (phase) => {
      const fixture = createPrefetchFixture(tile(true, [tile()]));
      fixture.tiles.stats[phase] = 1;
      await fixture.start();
      expect(fixture.tiles.requestTileContents).not.toHaveBeenCalled();
    }
  );

  it.each(["memory", "download-queue", "parse-queue"] as const)(
    "obeys %s admission limits",
    async (gate) => {
      const fixture = createPrefetchFixture(tile(true, [tile()]));
      if (gate === "memory") fixture.tiles.lruCache.cachedBytes = 800;
      if (gate === "download-queue")
        fixture.tiles.downloadQueue.maxJobsPerOrigin = 0;
      if (gate === "parse-queue") fixture.tiles.parseQueue.maxJobs = 0;
      await fixture.start();
      expect(fixture.tiles.requestTileContents).not.toHaveBeenCalled();
    }
  );

  it("does not speculate the missing normal-target payload before base coverage exists", async () => {
    const root = tile(false, [tile()]);
    const fixture = createPrefetchFixture(root);
    await fixture.start();
    expect(fixture.tiles.requestTileContents).not.toHaveBeenCalled();
  });

  it("rechecks queue pressure after each completed payload", async () => {
    const first = tile();
    const second = tile();
    const fixture = createPrefetchFixture(tile(true, [first, second]));
    const task = fixture.start();
    fixture.tiles.stats.queued = 1;
    await fixture.complete(first);
    await task;
    expect(fixture.tiles.requestTileContents).toHaveBeenCalledOnce();
    expect(first.internal.loadingState).toBe(LOADED_LOADING_STATE);
  });

  it.each(["foreground", "memory"] as const)(
    "rechecks %s pressure after a metadata traversal yield before admitting another payload",
    async (pressure) => {
      vi.useFakeTimers();
      // The root and thirty already-discovered metadata nodes precede the
      // next payload, placing admission immediately after the traversal yield.
      const entry = tile();
      const metadata = Array.from({ length: 30 }, () => tile(true, [], true));
      const fixture = createPrefetchFixture(tile(true, [...metadata, entry]));
      try {
        const task = fixture.start();
        expect(
          fixture.tiles.ensureChildrenArePreprocessed
        ).toHaveBeenCalledTimes(31);
        expect(vi.getTimerCount()).toBe(1);
        expect(fixture.tiles.requestTileContents).not.toHaveBeenCalled();
        if (pressure === "foreground") fixture.tiles.stats.queued = 1;
        else fixture.tiles.lruCache.cachedBytes = 800;
        await vi.advanceTimersByTimeAsync(0);
        expect(fixture.tiles.requestTileContents).not.toHaveBeenCalled();
        await task;
        expect(entry.internal.loadingState).toBe(UNLOADED_LOADING_STATE);
      } finally {
        fixture.controller.abort();
        vi.useRealTimers();
      }
    }
  );

  it("cancels only its pending payload, retaining earlier completed data and unrelated work", async () => {
    const first = tile();
    const second = tile();
    const unrelated = tile();
    unrelated.internal.loadingState = LOADING_LOADING_STATE;
    const fixture = createPrefetchFixture(tile(true, [first, second]));
    const task = fixture.start();
    await fixture.complete(first);
    expect(second.zoomPrefetch).toBe(true);
    fixture.controller.abort();
    await task;
    expect(
      fixture.tiles.lruCache.remove.mock.calls.map(([entry]) => entry)
    ).toEqual([second]);
    expect(first.internal.loadingState).toBe(LOADED_LOADING_STATE);
    expect(unrelated.internal.loadingState).toBe(LOADING_LOADING_STATE);
    expect(second.zoomPrefetch).toBe(false);
  });

  it.each(["camera", "receiver", "foreground"] as const)(
    "keeps a pending payload adopted by %s demand on zoomend",
    async (owner) => {
      const entry = tile();
      const root = tile(true, [entry]);
      const fixture = createPrefetchFixture(root);
      const task = fixture.start();
      if (owner === "camera")
        fixture.dependencies.getTileCameraDemand.mockReturnValue({
          required: true,
          receiver: false,
          errorRatio: 0,
          priority: TILE_CAMERA_PRIORITY.PRIMARY,
        });
      if (owner === "receiver") entry.shadowReceiverCurrent = true;
      if (owner === "foreground")
        fixture.dependencies.getTileScreenError.mockReturnValue(4);
      fixture.controller.abort();
      expect(fixture.tiles.lruCache.remove).not.toHaveBeenCalled();
      await fixture.complete(entry);
      await task;
      expect(entry.internal.loadingState).toBe(LOADED_LOADING_STATE);
      expect(entry.zoomPrefetch).toBe(false);
    }
  );

  it("does not discard a just-completed payload when zoomend wins the continuation race", async () => {
    const entry = tile();
    const fixture = createPrefetchFixture(tile(true, [entry]));
    const task = fixture.start();
    const completed = fixture.complete(entry);
    fixture.controller.abort();
    await completed;
    await task;
    expect(fixture.tiles.lruCache.remove).not.toHaveBeenCalled();
    expect(entry.internal.loadingState).toBe(LOADED_LOADING_STATE);
  });

  it("never starts with an already aborted signal", async () => {
    const fixture = createPrefetchFixture(tile(true, [tile()]));
    fixture.controller.abort();
    await fixture.start();
    expect(fixture.tiles.requestTileContents).not.toHaveBeenCalled();
  });

  it("caps each gesture at sixteen speculative requests", async () => {
    const entries = Array.from({ length: 20 }, () => tile());
    const fixture = createPrefetchFixture(tile(true, entries));
    const task = fixture.start();
    for (const entry of entries.slice(0, 16)) await fixture.complete(entry);
    await task;
    expect(fixture.tiles.requestTileContents).toHaveBeenCalledTimes(16);
    expect(entries[16].internal.loadingState).toBe(UNLOADED_LOADING_STATE);
  });
});
