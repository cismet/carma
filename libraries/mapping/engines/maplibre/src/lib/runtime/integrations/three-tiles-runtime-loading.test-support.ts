import { TilesRenderer } from "3d-tiles-renderer";
import { LRUCache } from "3d-tiles-renderer/core";
import type { Map as MaplibreMap } from "maplibre-gl";
import { vi } from "vitest";

import { createThreeTilesLoading } from "./three-tiles-runtime-loading";
import { createThreeTilesRuntimeState } from "./three-tiles-runtime-state";
import type { RuntimeTilesRenderer } from "./three-tiles-runtime-types";

export const fixture = (moving = false) => {
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
