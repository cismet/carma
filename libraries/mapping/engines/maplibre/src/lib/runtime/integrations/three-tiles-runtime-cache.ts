import { type Tile } from "3d-tiles-renderer/core";

import { isExtentFloorTile } from "../../core/mesh-error-policy";

import {
  isMeshCoverageRemovalSafe,
  isMeshTileUnconditionallyRefined,
} from "../../core/mesh-tile-coverage";
import {
  HIDDEN_TAB_WIPE_DELAY_MS,
  VIEW_QUALITY_AUDIT_PASSES,
} from "./three-tiles-runtime-config";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import type { RuntimeLruCache, RuntimeTile } from "./three-tiles-runtime-types";
import { LOADED_LOADING_STATE } from "./three-tiles-runtime-vendor";
import type { TilesetDeferredMaterialsPlugin } from "./tileset-deferred-materials-plugin";
import { createThreeTilesCacheBudget } from "./three-tiles-runtime-cache-budget";
import { createThreeTilesSettledDemand } from "./three-tiles-runtime-settled-demand";

export type ThreeTilesCacheState = Pick<
  ThreeTilesRuntimeState,
  | "allocationFailed"
  | "bytesPredictor"
  | "cacheCeilingMemory"
  | "cacheCeilingPeakWrittenAt"
  | "cacheCeilingStorage"
  | "ceilingBytes"
  | "contextLost"
  | "deviceProfile"
  | "displayedMeshFrontier"
  | "committedMeshCasterFrontier"
  | "disposed"
  | "effectiveErrorTarget"
  | "extentFloorArmed"
  | "extentFloorPending"
  | "extentGeometricError"
  | "hiddenWipeTimer"
  | "lastMainViewConverged"
  | "lastMemoryCheck"
  | "learnedCeilingBytes"
  | "map"
  | "memoryAdmissionPaused"
  | "memoryErrorTarget"
  | "meshAuditTimer"
  | "meshDemandSweepPending"
  | "meshInitialReserveSettled"
  | "options"
  | "requestedErrorTarget"
  | "shadowReceiverMask"
  | "shadowReceiverMatch"
  | "shadowSelectionRefreshPending"
  | "shadowView"
  | "styleCacheBudgetBytes"
  | "styleCacheOverflowBytes"
  | "tileBoundingBox"
  | "tileBoundsTransform"
  | "tileRetries"
  | "tiles"
  | "viewFrustumsReady"
  | "viewQualityAuditPasses"
>;

export function createThreeTilesCache(
  runtimeState: ThreeTilesCacheState,
  dependencies: Pick<
    ThreeTilesRuntimeServices,
    | "applyRequestConcurrency"
    | "applyTileDeferral"
    | "assignTilePriority"
    | "clearHiddenWipeTimer"
    | "getTileCameraDemand"
    | "getTileScreenError"
    | "isTileInMainView"
    | "maybeEnableShadowSelection"
    | "requestRender"
    | "requestShadowSelectionRefresh"
    | "resetDeferredTiles"
    | "resetEffectiveErrorTarget"
    | "runDownloadQueues"
    | "setShadowSelectionEnabled"
  >
) {
  const publishedCoverage = new Set<Tile>();
  const reserveCoverage = new Set<Tile>();
  let guardedCache: RuntimeLruCache | null = null;
  let originalCacheRemove: RuntimeLruCache["remove"] | null = null;
  let explicitCacheTeardown = false;

  // The configured residual surface is a residency guarantee, not merely one
  // interchangeable fallback. Keep its coarser ancestors and metadata too:
  // disposing external metadata also disposes the subtree that it owns.
  const isProtectedResidual = (tile: Tile) =>
    runtimeState.options.providesTerrain &&
    runtimeState.extentFloorArmed &&
    runtimeState.extentGeometricError > 0 &&
    tile.internal?.loadingState === LOADED_LOADING_STATE &&
    (tile.internal.hasUnrenderableContent ||
      (tile.internal.hasRenderableContent &&
        isExtentFloorTile(tile, runtimeState.extentGeometricError)));

  const rememberPublishedCoverage = () => {
    if (!runtimeState.tiles) return;
    for (const tile of runtimeState.tiles.visibleTiles)
      publishedCoverage.add(tile);
    for (const tile of runtimeState.displayedMeshFrontier)
      publishedCoverage.add(tile);
  };

  const installCoverageRemovalGuard = (cache: RuntimeLruCache) => {
    if (guardedCache === cache) return;
    guardedCache = cache;
    originalCacheRemove = cache.remove.bind(cache);
    cache.remove = ((tile: Tile) => {
      if (
        !explicitCacheTeardown &&
        !runtimeState.disposed &&
        isProtectedResidual(tile)
      )
        return false;
      if (
        !explicitCacheTeardown &&
        !runtimeState.disposed &&
        (runtimeState.committedMeshCasterFrontier.has(tile) ||
          (runtimeState.displayedMeshFrontier.has(tile) &&
            dependencies.isTileInMainView(tile as RuntimeTile)))
      )
        return false;
      rememberPublishedCoverage();
      // A resident reserve is coverage even before its first on-screen draw.
      // Stale queued/downloading work remains freely cancellable.
      if (
        (tile as RuntimeTile).idleRing &&
        tile.internal?.hasRenderableContent &&
        tile.internal.loadingState === LOADED_LOADING_STATE
      )
        reserveCoverage.add(tile);
      const currentPublished = new Set([
        ...runtimeState.committedMeshCasterFrontier,
        ...runtimeState.displayedMeshFrontier,
        ...(runtimeState.tiles?.visibleTiles ?? []),
      ]);
      const materials = runtimeState.tiles?.getPluginByName(
        "CARMA_DEFERRED_TILE_MATERIALS"
      ) as TilesetDeferredMaterialsPlugin | null | undefined;
      if (
        !explicitCacheTeardown &&
        !runtimeState.disposed &&
        (publishedCoverage.has(tile) ||
          reserveCoverage.has(tile) ||
          (runtimeState.options.providesTerrain &&
            tile.internal?.hasRenderableContent &&
            tile.internal.loadingState === LOADED_LOADING_STATE)) &&
        !isMeshCoverageRemovalSafe(
          tile,
          // Visible geometry needs an actual published handoff. Hidden reserve
          // geometry may be replaced by another resident cut without drawing it.
          currentPublished.has(tile)
            ? currentPublished
            : {
                has: (candidate) =>
                  cache.itemSet.has(candidate) &&
                  (!materials || materials.isReady(candidate)),
              },
          (ancestor) =>
            // A loaded floor prevents holes, but is not an acceptable replacement
            // for detail still demanded by any current receiver camera.
            !currentPublished.has(tile) ||
            !dependencies.isTileInMainView(tile as RuntimeTile) ||
            dependencies.getTileScreenError(ancestor as RuntimeTile) <=
              Math.max(
                runtimeState.requestedErrorTarget,
                runtimeState.memoryErrorTarget
              )
        )
      )
        return false;
      const removed = originalCacheRemove!(tile);
      if (removed) {
        publishedCoverage.delete(tile);
        reserveCoverage.delete(tile);
      }
      return removed;
    }) as RuntimeLruCache["remove"];
    // Native LRU batch eviction invokes disposal callbacks directly, bypassing
    // remove(). Pin the published cut and each hidden tile's replacement for
    // the entire batch: independently safe removals must not erase each other's
    // fallback. A visible family is released only AFTER publication changes.
    const unload = cache.unloadUnusedContent.bind(cache);
    cache.unloadUnusedContent = () => {
      if (
        explicitCacheTeardown ||
        runtimeState.disposed ||
        !runtimeState.options.providesTerrain
      )
        return unload();
      // A camera change is not memory pressure. Keep the warmed resident pool
      // above the native soft watermark until the actual budget becomes tight.
      if (!cache.isFull() && !runtimeState.memoryAdmissionPaused) return;
      const temporaryPins = new Set<Tile>();
      const pin = (tile: Tile) => {
        if (cache.itemSet.has(tile) && !cache.usedSet.has(tile)) {
          temporaryPins.add(tile);
          cache.markUsed(tile);
        }
      };
      for (const tile of runtimeState.displayedMeshFrontier) pin(tile);
      for (const tile of runtimeState.committedMeshCasterFrontier) pin(tile);
      for (const tile of runtimeState.tiles?.visibleTiles ?? []) pin(tile);
      const materials = runtimeState.tiles?.getPluginByName(
        "CARMA_DEFERRED_TILE_MATERIALS"
      ) as TilesetDeferredMaterialsPlugin | null | undefined;
      for (const tile of cache.itemList) {
        if (tile.internal?.loadingState !== LOADED_LOADING_STATE) continue;
        if (isProtectedResidual(tile)) {
          pin(tile);
          continue;
        }
        // External metadata owns the resident subtree, not just its own bytes.
        if (tile.internal.hasUnrenderableContent) {
          pin(tile);
          continue;
        }
        if (!tile.internal.hasRenderableContent) continue;
        let replacement: Tile | null = null;
        for (let parent = tile.parent; parent; parent = parent.parent) {
          if (
            parent.refine === "REPLACE" &&
            parent.internal?.hasRenderableContent &&
            !isMeshTileUnconditionallyRefined(parent) &&
            parent.internal.loadingState === LOADED_LOADING_STATE &&
            cache.itemSet.has(parent) &&
            (!materials || materials.isReady(parent))
          ) {
            // Published detail is pinned above. Hidden intermediate levels
            // need coverage, not idle-quality replacement. Prefer the coarsest
            // resident fallback so the whole pyramid does not pin itself.
            replacement = parent;
          }
        }
        pin(replacement ?? tile);
      }
      const originalMinBytes = cache.minBytesSize;
      cache.minBytesSize = Math.max(
        originalMinBytes,
        cache.maxBytesSize * 0.95
      );
      try {
        unload();
      } finally {
        cache.minBytesSize = originalMinBytes;
        for (const tile of temporaryPins) cache.usedSet.delete(tile);
      }
    };
  };

  const getRuntimeCache: ThreeTilesRuntimeServices["getRuntimeCache"] =
    (): RuntimeLruCache | null => {
      const cache = runtimeState.tiles
        ? (runtimeState.tiles.lruCache as RuntimeLruCache)
        : null;
      if (cache) installCoverageRemovalGuard(cache);
      rememberPublishedCoverage();
      return cache;
    };

  const evictUnusedCacheItems: ThreeTilesRuntimeServices["evictUnusedCacheItems"] =
    () => {
      const cache = getRuntimeCache();
      if (!cache) return;
      for (const tile of [...cache.itemList]) {
        if (!cache.usedSet.has(tile)) cache.remove(tile);
      }
    };

  /** Release a hidden tab's detail, but never its configured residual surface. */
  const wipeCacheWhileHidden: ThreeTilesRuntimeServices["wipeCacheWhileHidden"] =
    () => {
      runtimeState.hiddenWipeTimer = 0;
      if (!runtimeState.tiles) return;
      dependencies.setShadowSelectionEnabled(false);
      dependencies.resetEffectiveErrorTarget();
      dependencies.resetDeferredTiles();
      runtimeState.tileRetries.reset();
      const cache = getRuntimeCache();
      if (!cache) return;
      explicitCacheTeardown = true;
      try {
        for (const tile of [...cache.itemSet.keys()]) {
          if (!isProtectedResidual(tile)) cache.remove(tile);
        }
      } finally {
        explicitCacheTeardown = false;
        publishedCoverage.clear();
        reserveCoverage.clear();
        runtimeState.meshInitialReserveSettled = false;
      }
    };

  const handleVisibilityChange: ThreeTilesRuntimeServices["handleVisibilityChange"] =
    () => {
      if (!runtimeState.tiles) return;
      if (document.visibilityState !== "hidden") {
        dependencies.clearHiddenWipeTimer();
        runtimeState.viewQualityAuditPasses = VIEW_QUALITY_AUDIT_PASSES;
        runtimeState.tiles.dispatchEvent({ type: "needs-update" });
        dependencies.requestRender();
        return;
      }
      // Unused content goes at once; the tiles of the last view stay for a
      // quick return before the debounced full wipe.
      evictUnusedCacheItems();
      dependencies.clearHiddenWipeTimer();
      runtimeState.hiddenWipeTimer = window.setTimeout(
        wipeCacheWhileHidden,
        HIDDEN_TAB_WIPE_DELAY_MS
      );
    };

  /** Current view plus its sunward receiver prisms, not last frame's usedSet. */
  const {
    isRequiredMeshTile,
    sweepSettledMeshDemand,
    scheduleSettledMeshAudit,
  } = createThreeTilesSettledDemand(runtimeState, {
    ...dependencies,
    getRuntimeCache,
  });

  const {
    applyCacheBudget,
    reapplyCacheBoundsIfDrifted,
    sampleMemoryPressure,
    handleContextLost,
    recordCacheCeilingFailure,
    endCacheCeilingSession,
    handleContextRestored,
    setCacheBudget,
  } = createThreeTilesCacheBudget(runtimeState, {
    ...dependencies,
    getRuntimeCache,
    evictUnusedCacheItems,
  });

  return {
    getRuntimeCache,
    evictUnusedCacheItems,
    wipeCacheWhileHidden,
    handleVisibilityChange,
    isRequiredMeshTile,
    sweepSettledMeshDemand,
    scheduleSettledMeshAudit,
    applyCacheBudget,
    reapplyCacheBoundsIfDrifted,
    sampleMemoryPressure,
    handleContextLost,
    recordCacheCeilingFailure,
    endCacheCeilingSession,
    handleContextRestored,
    setCacheBudget,
  };
}
