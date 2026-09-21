import { type Tile } from "3d-tiles-renderer/core";

import { readOrientedTileBounds } from "./three-tiles-bounds";
import {
  CACHE_CEILING_FAILURE_FRACTION,
  CACHE_CEILING_PEAK_WRITE_INTERVAL_MS,
  EMPTY_CACHE_CEILING_MEMORY,
  endCacheCeilingSession as endCacheCeilingSessionMemory,
  learnCacheCeiling,
  recordCacheCeilingPeak,
  writeCacheCeilingMemory,
} from "./three-tiles-cache-ceiling-memory";
import {
  isExtentFloorTile,
  resolveTilesCacheBounds,
  resolveTilesCacheCeiling,
  TILES_LOAD_POLICY,
} from "./three-tiles-load-policy";
import {
  hasLoadedExtentFloorAncestor,
  isMeshCoverageRemovalSafe,
  isMeshCoveredByLoadedChildren,
  isMeshTileUnconditionallyRefined,
  shouldDeferMeshRefinement,
} from "./three-tiles-mesh-frontier";
import {
  DEFAULT_CACHE_MAX_ITEMS,
  DEFAULT_CACHE_MIN_ITEMS,
  HIDDEN_TAB_WIPE_DELAY_MS,
  MESH_EVICTION_BATCH_SIZE,
  MESH_SETTLED_AUDIT_INTERVAL_MS,
  VIEW_QUALITY_AUDIT_PASSES,
} from "./three-tiles-runtime-config";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import type {
  CacheBudgetOptions,
  RuntimeLruCache,
  RuntimeTile,
} from "./three-tiles-runtime-types";
import { LOADED_LOADING_STATE } from "./three-tiles-runtime-vendor";
import type { TilesetDeferredMaterialsPlugin } from "./tileset-deferred-materials-plugin";

/** Owns cache effects; policy inputs remain explicit and current. */
export function createThreeTilesCache(
  runtimeState: Pick<
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
    | "meshRefinementSupport"
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
  >,
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
  const isRequiredMeshTile: ThreeTilesRuntimeServices["isRequiredMeshTile"] = (
    tile: RuntimeTile
  ): boolean => {
    if (
      !runtimeState.viewFrustumsReady ||
      dependencies.isTileInMainView(tile) ||
      dependencies.getTileCameraDemand(tile).required
    )
      return true;
    // The idle ring is demand too: evicting it after every move would refetch it.
    if (tile.idleRing === true) return true;
    // Decision: MESH-SUPPORT-RETENTION-20260917 in
    // benchmarks/mesh-request-churn-20260917.md.
    // Publication support is demand too. The receiver cut queues the offscreen
    // siblings of an incomplete REPLACE family and `isTileRequestNeeded` keeps
    // those requests alive, so releasing them here only cancels a download that
    // the very next traversal requests again.
    if (runtimeState.meshRefinementSupport.has(tile)) return true;
    const bounds = tile.engineData?.boundingVolume;
    // Metadata is tiny and owns descendant topology. Unknown coverage is never
    // proof that deleting a subtree is safe.
    if (tile.internal?.hasUnrenderableContent || !bounds?.getAABB) return true;
    if (!runtimeState.shadowView) return false;
    if (!runtimeState.shadowReceiverMask) return false;
    readOrientedTileBounds(
      bounds,
      runtimeState.tileBoundingBox,
      runtimeState.tileBoundsTransform
    );
    return runtimeState.shadowReceiverMask.match(
      runtimeState.tileBoundingBox,
      runtimeState.shadowReceiverMatch,
      runtimeState.tileBoundsTransform,
      { key: tile, parent: tile.parent ?? undefined }
    );
  };

  const sweepSettledMeshDemand: ThreeTilesRuntimeServices["sweepSettledMeshDemand"] =
    () => {
      // Decision: MESH-SETTLED-DEMAND-20260908 in engines/maplibre/README.md.
      // Fresh geometric demand, not upstream ancestor LRU pins, controls release.
      if (
        !runtimeState.tiles ||
        !runtimeState.meshDemandSweepPending ||
        runtimeState.map?.isMoving?.()
      )
        return;
      const cache = getRuntimeCache();
      if (!cache) return;
      const viewError = { inView: false, error: 0, distanceFromCamera: 0 };
      for (const entry of cache.itemList) {
        const tile = entry as RuntimeTile;
        if (!tile.engineData?.boundingVolume?.distanceToPoint) continue;
        // The retained cut can include tiles the last traversal did not visit.
        // Read current camera SSE through the renderer, never reuse old-query
        // errors to decide that those tiles no longer need refinement.
        runtimeState.tiles.calculateTileViewError(tile, viewError);
        if (viewError.inView) {
          tile.traversal.error = viewError.error;
          tile.traversal.distanceFromCamera = viewError.distanceFromCamera;
        }
        dependencies.assignTilePriority(tile);
      }
      // Capture corridors from available receivers, not only from an already
      // perfect viewport: that would deadlock memory reclamation behind loading.
      dependencies.maybeEnableShadowSelection();
      if (
        runtimeState.shadowView &&
        (runtimeState.shadowSelectionRefreshPending ||
          !runtimeState.shadowReceiverMask)
      )
        return;
      runtimeState.meshDemandSweepPending = false;
      let removed = 0;
      for (const tile of [...cache.itemList]) {
        const pending = runtimeState.tiles.loadingTiles.has(tile);
        const underPressure =
          runtimeState.memoryAdmissionPaused || cache.isFull();
        // Skip strategy: memory is bounded by the LRU's retention floor and
        // its priority order (far and coarse first), so below the ceiling
        // every loaded tile stays: the rings, and any finer detail a view
        // had, which a pan back or a zoom-out then shows at once.
        if (!runtimeState.tiles.loadAncestors && !underPressure) break;
        // A floor tile replaced by its children is still the extent's
        // coverage the next zoom-out shows; never a candidate.
        const replacedParent =
          underPressure &&
          !runtimeState.tiles.activeTiles.has(tile) &&
          !isExtentFloorTile(tile, runtimeState.extentGeometricError) &&
          isMeshCoveredByLoadedChildren(tile, runtimeState.tiles.visibleTiles);
        // Skip strategy at the ceiling: a loaded refinement below the current
        // cut whose floor tile is resident can go, the floor keeps the ground
        // covered while the coarser level of the new view is admitted. Without
        // it a cache full of retained fine tiles admits nothing, and the
        // coarser replacement they wait for never arrives.
        // A loaded parent (the resident band or the floor) makes any tile
        // droppable: the parent shows in its place. While floor tiles are
        // still pending at the ceiling, even a displayed tile goes, finest
        // first, so the floor is admitted before the view refines.
        const parentLoaded =
          tile.parent?.internal?.hasRenderableContent === true &&
          tile.parent.internal.loadingState === LOADED_LOADING_STATE;
        const droppableRefinement =
          underPressure &&
          !pending &&
          runtimeState.tiles.loadAncestors === false &&
          tile.internal?.hasRenderableContent === true &&
          tile.internal.loadingState === LOADED_LOADING_STATE &&
          !isExtentFloorTile(tile, runtimeState.extentGeometricError) &&
          (parentLoaded ||
            hasLoadedExtentFloorAncestor(
              tile,
              runtimeState.extentGeometricError
            )) &&
          (runtimeState.extentFloorPending > 0 ||
            shouldDeferMeshRefinement(
              tile,
              runtimeState.effectiveErrorTarget,
              (parent) => dependencies.getTileScreenError(parent as RuntimeTile)
            ));
        // Paused parsing must not retain finer pending blobs behind the stage
        // that is waiting to publish. Release only unnecessary uncommitted work;
        // the complete visible receiver/caster cut remains pinned throughout.
        if (
          !replacedParent &&
          !droppableRefinement &&
          isRequiredMeshTile(tile as RuntimeTile)
        )
          continue;
        if (removed >= MESH_EVICTION_BATCH_SIZE) {
          runtimeState.meshDemandSweepPending = true;
          break;
        }
        // LRU removal invokes upstream's AbortController, queue cleanup, disposal
        // and byte accounting together. Never mutate request queues independently.
        if (cache.remove(tile)) {
          removed += 1;
          dependencies.applyTileDeferral(tile, false);
        }
      }
      if (removed > 0 || runtimeState.meshDemandSweepPending) {
        runtimeState.tiles.dispatchEvent({ type: "needs-update" });
        dependencies.requestRender();
      }
    };

  const scheduleSettledMeshAudit: ThreeTilesRuntimeServices["scheduleSettledMeshAudit"] =
    () => {
      if (
        !runtimeState.options.providesTerrain ||
        runtimeState.meshAuditTimer !== null ||
        runtimeState.disposed ||
        runtimeState.map?.isMoving?.()
      )
        return;
      if (
        runtimeState.lastMainViewConverged &&
        !runtimeState.memoryAdmissionPaused &&
        !runtimeState.meshDemandSweepPending
      )
        return;
      runtimeState.meshAuditTimer = setTimeout(() => {
        runtimeState.meshAuditTimer = null;
        if (runtimeState.disposed || runtimeState.map?.isMoving?.()) return;
        // Refresh stale demand at the requested target; local refinement and
        // existing deduplication/retry guards still control request admission.
        runtimeState.meshDemandSweepPending = true;
        dependencies.resetDeferredTiles();
        dependencies.requestShadowSelectionRefresh();
        runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
        dependencies.requestRender();
      }, MESH_SETTLED_AUDIT_INTERVAL_MS);
    };

  const applyCacheBudget: ThreeTilesRuntimeServices["applyCacheBudget"] =
    () => {
      const cache = getRuntimeCache();
      if (!cache) return;
      const ceiling = runtimeState.ceilingBytes;
      const bounds = resolveTilesCacheBounds({
        ceilingBytes: ceiling,
        estimateBytes: runtimeState.bytesPredictor.globalEstimate(),
      });
      // Admission stops at the physical ceiling (tiles register their predicted
      // bytes on admission, so `cachedBytes` grows before downloads finish); the
      // asynchronous eviction keeps a retention floor below it and only aborts
      // in-flight tiles once the real bytes drift far beyond the estimates.
      cache.minSize = DEFAULT_CACHE_MIN_ITEMS;
      cache.maxSize = DEFAULT_CACHE_MAX_ITEMS;
      cache.minBytesSize = bounds.minBytesSize;
      cache.maxBytesSize = bounds.maxBytesSize;
      cache.unloadPercent = TILES_LOAD_POLICY.cacheUnloadPercent;
      cache.isFull = () =>
        runtimeState.memoryAdmissionPaused ||
        cache.itemSet.size >= cache.maxSize ||
        cache.cachedBytes >= ceiling;
      cache.scheduleUnload();
    };

  const reapplyCacheBoundsIfDrifted: ThreeTilesRuntimeServices["reapplyCacheBoundsIfDrifted"] =
    () => {
      const cache = getRuntimeCache();
      if (!cache) return;
      const bounds = resolveTilesCacheBounds({
        ceilingBytes: runtimeState.ceilingBytes,
        estimateBytes: runtimeState.bytesPredictor.globalEstimate(),
      });
      if (
        Math.abs(bounds.maxBytesSize - cache.maxBytesSize) >
        TILES_LOAD_POLICY.cacheBoundsReapplyBytes
      ) {
        applyCacheBudget();
      }
    };

  const sampleMemoryPressure: ThreeTilesRuntimeServices["sampleMemoryPressure"] =
    () => {
      const now = performance.now();
      if (
        !runtimeState.allocationFailed &&
        !runtimeState.contextLost &&
        now - runtimeState.lastMemoryCheck <
          TILES_LOAD_POLICY.memoryCheckIntervalMs
      )
        return;
      runtimeState.lastMemoryCheck = now;
      const residentCache = getRuntimeCache();
      if (runtimeState.cacheCeilingMemory && residentCache) {
        runtimeState.cacheCeilingMemory = recordCacheCeilingPeak(
          runtimeState.cacheCeilingMemory,
          residentCache.cachedBytes
        );
        if (
          now - runtimeState.cacheCeilingPeakWrittenAt >=
          CACHE_CEILING_PEAK_WRITE_INTERVAL_MS
        ) {
          runtimeState.cacheCeilingPeakWrittenAt = now;
          persistCacheCeilingMemory();
        }
      }
      const wasPaused = runtimeState.memoryAdmissionPaused;
      // A tab-wide heap ratio includes Vite/HMR, MapLibre and unrelated app
      // state. It can start above the old threshold before the first mesh tile
      // and permanently set both queues to zero. The finite tile-cache budget
      // still bounds normal admission; only actual allocation or context failure
      // stops it here while per-tile loading stages are diagnosed.
      runtimeState.memoryAdmissionPaused =
        runtimeState.allocationFailed || runtimeState.contextLost;
      if (runtimeState.memoryAdmissionPaused && !wasPaused) {
        if (runtimeState.options.providesTerrain)
          runtimeState.meshDemandSweepPending = true;
        else evictUnusedCacheItems();
        // Drop unfinished requests/parse buffers, never the visible replacement
        // parents or loaded caster coverage. Paused queues must not pin blobs.
        if (runtimeState.tiles && !runtimeState.options.providesTerrain) {
          for (const tile of [...runtimeState.tiles.loadingTiles]) {
            if (!runtimeState.tiles.visibleTiles.has(tile))
              runtimeState.tiles.lruCache.remove(tile);
          }
        }
      }
      if (wasPaused && !runtimeState.memoryAdmissionPaused) {
        runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
        dependencies.requestRender();
      }
    };

  const handleContextLost: ThreeTilesRuntimeServices["handleContextLost"] =
    () => {
      runtimeState.contextLost = true;
      recordCacheCeilingFailure("context-lost");
      dependencies.applyRequestConcurrency();
    };

  const unlearnedCeilingBytes = () =>
    resolveTilesCacheCeiling(runtimeState.deviceProfile, {
      cacheBudgetBytes: runtimeState.styleCacheBudgetBytes,
      cacheOverflowBytes: runtimeState.styleCacheOverflowBytes,
    });
  const persistCacheCeilingMemory = () => {
    if (runtimeState.cacheCeilingMemory)
      writeCacheCeilingMemory(
        runtimeState.cacheCeilingStorage,
        runtimeState.cacheCeilingMemory
      );
  };
  const recordCacheCeilingFailure: ThreeTilesRuntimeServices["recordCacheCeilingFailure"] =
    (reason) => {
      const cached = getRuntimeCache()?.cachedBytes ?? 0;
      // A lost context with a mostly empty cache is a GPU reset or a
      // backgrounded tab, not a memory signal; only a well-filled cache learns.
      if (reason === "context-lost" && cached < runtimeState.ceilingBytes * 0.5)
        return;
      const lesson = learnCacheCeiling(
        runtimeState.cacheCeilingMemory ?? EMPTY_CACHE_CEILING_MEMORY,
        Math.max(cached, runtimeState.ceilingBytes) *
          CACHE_CEILING_FAILURE_FRACTION,
        reason
      );
      if (lesson.learnedBytes === runtimeState.learnedCeilingBytes) return;
      runtimeState.learnedCeilingBytes = lesson.learnedBytes;
      if (runtimeState.cacheCeilingMemory) {
        runtimeState.cacheCeilingMemory = lesson;
        persistCacheCeilingMemory();
      }
      runtimeState.ceilingBytes = resolveTilesCacheCeiling(
        runtimeState.deviceProfile,
        {
          cacheBudgetBytes: runtimeState.styleCacheBudgetBytes,
          cacheOverflowBytes: runtimeState.styleCacheOverflowBytes,
        },
        runtimeState.learnedCeilingBytes
      );
      applyCacheBudget();
    };
  const endCacheCeilingSession: ThreeTilesRuntimeServices["endCacheCeilingSession"] =
    () => {
      if (!runtimeState.cacheCeilingMemory) return;
      const peak = getRuntimeCache()?.cachedBytes ?? 0;
      runtimeState.cacheCeilingMemory = endCacheCeilingSessionMemory(
        recordCacheCeilingPeak(runtimeState.cacheCeilingMemory, peak),
        unlearnedCeilingBytes()
      );
      persistCacheCeilingMemory();
    };

  const handleContextRestored: ThreeTilesRuntimeServices["handleContextRestored"] =
    () => {
      runtimeState.contextLost = false;
      runtimeState.lastMemoryCheck = Number.NEGATIVE_INFINITY;
      dependencies.applyRequestConcurrency();
      if (!runtimeState.memoryAdmissionPaused) dependencies.runDownloadQueues();
    };

  const setCacheBudget: ThreeTilesRuntimeServices["setCacheBudget"] = (
    bytes?: number,
    cacheOptions?: CacheBudgetOptions
  ) => {
    runtimeState.allocationFailed = false;
    runtimeState.lastMemoryCheck = Number.NEGATIVE_INFINITY;
    runtimeState.styleCacheBudgetBytes =
      bytes === undefined ? undefined : Math.max(0, Math.floor(bytes));
    runtimeState.styleCacheOverflowBytes =
      cacheOptions?.overflowBytes === undefined
        ? undefined
        : Math.max(0, Math.floor(cacheOptions.overflowBytes));
    runtimeState.ceilingBytes = resolveTilesCacheCeiling(
      runtimeState.deviceProfile,
      {
        cacheBudgetBytes: runtimeState.styleCacheBudgetBytes,
        cacheOverflowBytes: runtimeState.styleCacheOverflowBytes,
      },
      runtimeState.learnedCeilingBytes
    );
    dependencies.resetEffectiveErrorTarget();
    dependencies.requestShadowSelectionRefresh();
    applyCacheBudget();
    dependencies.applyRequestConcurrency();
    runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
  };

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
