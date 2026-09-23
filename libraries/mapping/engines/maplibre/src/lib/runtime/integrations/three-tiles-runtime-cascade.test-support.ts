import { Box3, Group, PerspectiveCamera, Vector3 } from "three";
import { expect, vi } from "vitest";
import {
  snapshotTileCameraViews,
  TILE_CAMERA_ROLE,
  TILE_CAMERA_PRIORITY,
} from "../../core/tile-camera-demand";
import { createThreeTilesCascade } from "./three-tiles-runtime-cascade";

import type { RuntimeTile } from "./three-tiles-runtime-types";
import {
  LOADED_LOADING_STATE,
  LOADING_LOADING_STATE,
  QUEUED_LOADING_STATE,
  UNLOADED_LOADING_STATE,
} from "./three-tiles-runtime-vendor";

export const tile = (
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

export const createPrefetchFixture = (root: RuntimeTile) => {
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
    downloadQueue: { maxJobsPerOrigin: 4, originQueues: new Map() },
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
  const originQueue = {
    get items() {
      return [...tiles.loadingTiles].filter(
        (entry) => entry.internal.loadingState === QUEUED_LOADING_STATE
      );
    },
    get currJobs() {
      return [...tiles.loadingTiles].filter(
        (entry) => entry.internal.loadingState === LOADING_LOADING_STATE
      ).length;
    },
    has: (entry: RuntimeTile) => tiles.loadingTiles.has(entry),
  };
  tiles.downloadQueue.originQueues = new Map([["test", originQueue]]);
  const state = {
    options: {},
    tiles,
    requestedErrorTarget: 2,
    effectiveErrorTarget: 2,
    memoryErrorTarget: 2,
    meshCoverageRecovery: false,
    lastMainViewConverged: true,
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
    getDownloadPreemptionEligibility: vi.fn(
      () => (_entry: RuntimeTile) => true
    ),
    isTileInPrefetchMargin: () => false,
    isTileNeededForMeshCoverage: vi.fn(() => false),
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
