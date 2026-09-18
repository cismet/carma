import { TilesRenderer } from "3d-tiles-renderer";
import { type Tile } from "3d-tiles-renderer/core";

import { clamp } from "@carma-commons/math";

import { isSharedThreeTerrainLoading } from "./shared-three-terrain-registry";
import type { TilesetDeferredMaterialsPlugin } from "./tileset-deferred-materials-plugin";
import { readOrientedTileBounds } from "./three-tiles-bounds";
import { createTilesetMinResolutionService } from "./three-tiles-runtime-floor";
import {
  DEFERRED_TILE_LOADING_STATE,
  TILES_LOAD_POLICY,
  createEffectiveErrorTargetState,
  deriveTilePriority,
  initialMeshLoadError,
  nextEffectiveErrorTarget,
  resolveRequestConcurrency,
  resolveTilesCacheBounds,
  resolveTilesCacheCeiling,
  shouldDeferTile,
  isExtentFloorTile,
  nextMemoryErrorTarget,
} from "./three-tiles-load-policy";
import {
  hasDisplayedAncestor,
  getReadyMeshRegionCut,
  hasLoadedExtentFloorAncestor,
  isMeshCoverageRemovalSafe,
  isMeshCoveredByLoadedChildren,
  isMeshTileUnconditionallyRefined,
  shouldDeferMeshRefinement,
} from "./three-tiles-mesh-frontier";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import type {
  CacheBudgetOptions,
  RuntimeLruCache,
  RuntimePriorityQueue,
  RuntimeTile,
} from "./three-tiles-runtime-types";
import {
  DEFAULT_CACHE_MAX_ITEMS,
  DEFAULT_CACHE_MIN_ITEMS,
  HIDDEN_TAB_WIPE_DELAY_MS,
  MESH_DOWNLOAD_CONCURRENCY,
  MESH_EVICTION_BATCH_SIZE,
  MESH_PARSE_BACKLOG_HARD_LIMIT,
  MESH_PARSE_BACKLOG_SOFT_LIMIT,
  MESH_SETTLED_AUDIT_INTERVAL_MS,
  TERRAIN_LOADING_CONTENT_BOOTSTRAP_CONCURRENCY,
  TILES_ERROR_TARGET_MAX_PIXELS,
  TILES_ERROR_TARGET_MIN_PIXELS,
  VIEW_QUALITY_AUDIT_PASSES,
  MESH_MOTION_DOWNLOAD_CONCURRENCY,
  MESH_MOTION_PARSE_CONCURRENCY,
} from "./three-tiles-runtime-config";
import {
  LOADED_LOADING_STATE,
  UNLOADED_LOADING_STATE,
  isUnconditionallyRefined,
  readMapView,
} from "./three-tiles-runtime-vendor";

/** loading responsibility of the shared 3D Tiles runtime. */
export function createThreeTilesLoading(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    | "options"
    | "requestedErrorTarget"
    | "map"
    | "tiles"
    | "errorTargetTimer"
    | "kickstartTimer"
    | "hiddenWipeTimer"
    | "disposed"
    | "runtimeVisible"
    | "shadowView"
    | "shadowSelectionEnabled"
    | "shadowSelectionNeedsTraversal"
    | "tileRetries"
    | "viewQualityAuditPasses"
    | "lastNotifiedRequestDemand"
    | "payloadAwareConcurrency"
    | "usedBytesMain"
    | "effectiveErrorTarget"
    | "errorTargetState"
    | "lastMainViewConverged"
    | "meshBaseCoverageReady"
    | "meshInitialReserveSettled"
    | "extentFloorArmed"
    | "extentGeometricError"
    | "extentFloorPending"
    | "extentFloorAuditPending"
    | "displayedMeshFrontier"
    | "meshRefinementSupport"
    | "ceilingBytes"
    | "lastProgressAt"
    | "deferred"
    | "viewFrustumsReady"
    | "shadowReceiverMask"
    | "tileBoundingBox"
    | "tileBoundsTransform"
    | "shadowReceiverMatch"
    | "meshDemandSweepPending"
    | "shadowSelectionRefreshPending"
    | "memoryAdmissionPaused"
    | "loadingPaused"
    | "foveationWeight"
    | "memoryErrorTarget"
    | "memoryErrorTargetChangedAt"
    | "lastMainViewConverged"
    | "tilesetMinResolutionPx"
    | "appliedTilesetMinResolutionPx"
    | "appliedTilesetMinCeilingBytes"
    | "rootLongestAxisMeters"
    | "meshAuditTimer"
    | "bytesPredictor"
    | "allocationFailed"
    | "contextLost"
    | "lastMemoryCheck"
    | "normalParseConcurrency"
    | "requestConcurrency"
    | "requestBackoffTimer"
    | "tileViewFrustum"
    | "styleCacheBudgetBytes"
    | "styleCacheOverflowBytes"
    | "deviceProfile"
  >,
  dependencies: Pick<
    ThreeTilesRuntimeServices,
    | "requestShadowSelectionRefresh"
    | "setShadowSelectionEnabled"
    | "isTileInMainView"
    | "getTileCameraDemand"
    | "getTileRequestPriority"
    | "maybeEnableShadowSelection"
    | "isTileInPrefetchMargin"
    | "getTileCenterness"
    | "getTileScreenError"
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
  const initialEffectiveErrorTarget: ThreeTilesRuntimeServices["initialEffectiveErrorTarget"] =
    () =>
      runtimeState.options.providesTerrain
        ? initialMeshLoadError(
            runtimeState.requestedErrorTarget,
            runtimeState.options.baseErrorTargetPixels
          )
        : runtimeState.requestedErrorTarget;

  const requestRender: ThreeTilesRuntimeServices["requestRender"] = () =>
    runtimeState.map?.triggerRepaint();

  const getDownloadQueues: ThreeTilesRuntimeServices["getDownloadQueues"] =
    (): RuntimePriorityQueue[] =>
      runtimeState.tiles
        ? [...runtimeState.tiles.downloadQueue.originQueues.values()].map(
            (queue) => queue as RuntimePriorityQueue
          )
        : [];

  const runDownloadQueues: ThreeTilesRuntimeServices["runDownloadQueues"] =
    () => {
      for (const queue of getDownloadQueues()) queue.tryRunJobs();
    };

  const clearErrorTargetTimer: ThreeTilesRuntimeServices["clearErrorTargetTimer"] =
    () => {
      if (runtimeState.errorTargetTimer) {
        window.clearTimeout(runtimeState.errorTargetTimer);
        runtimeState.errorTargetTimer = 0;
      }
    };

  const clearKickstartTimer: ThreeTilesRuntimeServices["clearKickstartTimer"] =
    () => {
      if (runtimeState.kickstartTimer) {
        window.clearInterval(runtimeState.kickstartTimer);
        runtimeState.kickstartTimer = 0;
      }
    };

  const clearHiddenWipeTimer: ThreeTilesRuntimeServices["clearHiddenWipeTimer"] =
    () => {
      if (runtimeState.hiddenWipeTimer) {
        window.clearTimeout(runtimeState.hiddenWipeTimer);
        runtimeState.hiddenWipeTimer = 0;
      }
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

  const getRequestDemand: ThreeTilesRuntimeServices["getRequestDemand"] =
    () => {
      if (runtimeState.disposed || !runtimeState.runtimeVisible) return 0;
      if (!runtimeState.tiles) return 1;
      const downloadDemand = getDownloadQueues().reduce(
        (total, queue) => total + queue.items.length + queue.currJobs,
        0
      );
      const processNodeQueue = runtimeState.tiles
        .processNodeQueue as typeof runtimeState.tiles.processNodeQueue & {
        items: unknown[];
        currJobs: number;
      };
      const stats = (
        runtimeState.tiles as TilesRenderer & {
          stats?: { queued?: number; downloading?: number; parsing?: number };
        }
      ).stats;
      return (
        downloadDemand +
        processNodeQueue.items.length +
        processNodeQueue.currJobs +
        (stats?.queued ?? 0) +
        (stats?.downloading ?? 0) +
        (stats?.parsing ?? 0) +
        (runtimeState.shadowView && !runtimeState.shadowSelectionEnabled
          ? 1
          : 0) +
        (runtimeState.shadowSelectionNeedsTraversal ? 1 : 0) +
        (runtimeState.tileRetries.hasPendingRetries() ? 1 : 0) +
        runtimeState.viewQualityAuditPasses +
        (runtimeState.tiles.group.children.length === 0 &&
        !runtimeState.tileRetries.hasExhaustedRetries()
          ? 1
          : 0)
      );
    };

  const notifyRequestStateChange: ThreeTilesRuntimeServices["notifyRequestStateChange"] =
    () => {
      const requestDemand = getRequestDemand();
      if (requestDemand === runtimeState.lastNotifiedRequestDemand) return;
      runtimeState.lastNotifiedRequestDemand = requestDemand;
      runtimeState.options.onRequestStateChange?.();
    };

  const isPipelineIdle: ThreeTilesRuntimeServices["isPipelineIdle"] = () =>
    runtimeState.tiles !== null &&
    !runtimeState.tiles.downloadQueue.running &&
    !runtimeState.tiles.parseQueue.running &&
    !runtimeState.tiles.processNodeQueue.running &&
    runtimeState.tiles.loadingTiles.size === 0 &&
    !runtimeState.tileRetries.hasPendingRetries() &&
    runtimeState.payloadAwareConcurrency.getCooldownRemainingMs() <= 0;

  const measureUsedBytesMain: ThreeTilesRuntimeServices["measureUsedBytesMain"] =
    () => {
      if (!runtimeState.tiles) return;
      let bytes = 0;
      for (const tile of runtimeState.tiles.usedSet) {
        bytes += runtimeState.tiles.lruCache.getMemoryUsage(tile);
      }
      runtimeState.usedBytesMain = bytes;
    };

  const applyEffectiveErrorTarget: ThreeTilesRuntimeServices["applyEffectiveErrorTarget"] =
    (nextTarget: number) => {
      if (runtimeState.effectiveErrorTarget === nextTarget) return;
      runtimeState.effectiveErrorTarget = nextTarget;
      if (runtimeState.tiles)
        runtimeState.tiles.errorTarget = runtimeState.effectiveErrorTarget;
      // Decision: CURRENT-VIEW-DEMAND-20260913 in TILES_COVERAGE.md. Deferral
      // belongs to the old target, not to the tile's reusable payload.
      resetDeferredTiles();
      runtimeState.meshDemandSweepPending = true;
      dependencies.requestShadowSelectionRefresh();
      runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
      requestRender();
    };

  const resetEffectiveErrorTarget: ThreeTilesRuntimeServices["resetEffectiveErrorTarget"] =
    () => {
      clearErrorTargetTimer();
      runtimeState.effectiveErrorTarget = initialEffectiveErrorTarget();
      runtimeState.errorTargetState = {
        ...createEffectiveErrorTargetState(
          runtimeState.requestedErrorTarget,
          Date.now()
        ),
        effective: runtimeState.effectiveErrorTarget,
      };
      if (runtimeState.tiles)
        runtimeState.tiles.errorTarget = runtimeState.effectiveErrorTarget;
    };

  const applyErrorTargetPolicy: ThreeTilesRuntimeServices["applyErrorTargetPolicy"] =
    () => {
      const cache = getRuntimeCache();
      if (!runtimeState.tiles || !cache) return;
      // Fill base coverage first, then let independent complete families reach
      // the requested target. Global 8/4/2px barriers delayed ready corridors.
      if (runtimeState.options.providesTerrain) {
        // Skip strategy: while the camera moves, stay at the base target so
        // the bounded motion pipeline fetches coverage for newly exposed
        // ground, not refinements that would queue up behind it and delay
        // the ring tiles' promotion at moveend; refinement resumes at rest.
        const movingSkipStrategy =
          runtimeState.tiles.loadAncestors === false &&
          runtimeState.map?.isMoving?.() === true;
        // Memory-adaptive target (TILES_COVERAGE.md, R6): at the ceiling with an
        // unconverged view the target rises by half, up to the root error;
        // with room to spare it steps back towards the requested target.
        const base = initialMeshLoadError(
          runtimeState.requestedErrorTarget,
          runtimeState.options.baseErrorTargetPixels
        );
        let usedBytes: number | undefined;
        if (
          !movingSkipStrategy &&
          runtimeState.memoryErrorTarget > runtimeState.requestedErrorTarget &&
          runtimeState.lastMainViewConverged &&
          isPipelineIdle()
        ) {
          // Includes resident ancestors/floor pins, not only visible leaves.
          usedBytes = 0;
          for (const tile of cache.usedSet)
            usedBytes += cache.getMemoryUsage(tile);
        }
        const memory = nextMemoryErrorTarget({
          current: runtimeState.memoryErrorTarget,
          requested: runtimeState.requestedErrorTarget,
          base,
          maximum: runtimeState.tiles.root
            ? dependencies.getTileScreenError(
                runtimeState.tiles.root as RuntimeTile
              )
            : base,
          cacheFull: cache.isFull(),
          viewConverged: runtimeState.lastMainViewConverged,
          cachedBytes: cache.cachedBytes,
          usedBytes,
          ceilingBytes: runtimeState.ceilingBytes,
          now: performance.now(),
          changedAt: runtimeState.memoryErrorTargetChangedAt,
        });
        if (!movingSkipStrategy) {
          runtimeState.memoryErrorTarget = memory.target;
          runtimeState.memoryErrorTargetChangedAt = memory.changedAt;
        }
        clearErrorTargetTimer();
        if (!movingSkipStrategy && memory.retryInMs !== null) {
          runtimeState.errorTargetTimer = window.setTimeout(() => {
            runtimeState.errorTargetTimer = 0;
            runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
            requestRender();
          }, memory.retryInMs);
        }
        const minimumTarget = Math.max(
          runtimeState.requestedErrorTarget,
          runtimeState.memoryErrorTarget
        );
        // Decision: VIEWPORT-REFINEMENT-WAVES-20260916, TILES_COVERAGE.md.
        // Only the actual published view cut advances a wave, never the
        // whole-extent reserve certificate or idle queues. Each wave remains
        // requestable while incomplete; failures retain the previous surface.
        const root = runtimeState.tiles.root;
        const readyAt = (error: number) =>
          !!root &&
          getReadyMeshRegionCut(
            root,
            runtimeState.displayedMeshFrontier,
            error,
            (tile) => ({
              intersects:
                !tile.traversal ||
                dependencies.isTileInMainView(tile as RuntimeTile),
              errorPixels: dependencies.getTileScreenError(tile as RuntimeTile),
            })
          ) !== null;
        const initialTarget = Math.max(base, minimumTarget);
        const initialReady = readyAt(initialTarget);
        const hasReserve =
          Number.isFinite(runtimeState.extentGeometricError) &&
          runtimeState.extentGeometricError > 0;
        const reserveLimited =
          (cache.isFull() ||
            runtimeState.memoryAdmissionPaused ||
            runtimeState.tiles.stats.failed > 0) &&
          !runtimeState.tiles.downloadQueue.running &&
          !runtimeState.tiles.parseQueue.running &&
          !runtimeState.tiles.processNodeQueue.running;
        if (
          !runtimeState.shadowView &&
          initialReady &&
          hasReserve &&
          runtimeState.extentFloorArmed &&
          !runtimeState.extentFloorAuditPending &&
          runtimeState.map?.isMoving?.() !== true &&
          ((isPipelineIdle() && runtimeState.extentFloorPending === 0) ||
            reserveLimited)
        )
          runtimeState.meshInitialReserveSettled = true;
        const reserveBeforeIdle =
          !runtimeState.shadowView &&
          hasReserve &&
          !runtimeState.meshInitialReserveSettled;
        const currentTarget = Math.max(
          minimumTarget,
          Math.min(initialTarget, runtimeState.effectiveErrorTarget)
        );
        // Shadow receivers already have a joint receiver/caster publication
        // gate; don't put a second bootstrap dependency in front of its jobs.
        const stageTarget = runtimeState.shadowView
          ? minimumTarget
          : !initialReady || reserveBeforeIdle
          ? initialTarget
          : readyAt(minimumTarget)
          ? minimumTarget
          : readyAt(currentTarget)
          ? Math.max(minimumTarget, currentTarget / 2)
          : currentTarget;
        if (
          runtimeState.effectiveErrorTarget !== stageTarget &&
          !movingSkipStrategy
        ) {
          applyEffectiveErrorTarget(stageTarget);
        }
        return;
      }
      const { zoom, pitch } = readMapView(runtimeState.map);
      const result = nextEffectiveErrorTarget(runtimeState.errorTargetState, {
        now: Date.now(),
        physicallyFull: cache.isFull(),
        pipelineIdle: isPipelineIdle(),
        mainConverged: runtimeState.lastMainViewConverged,
        usedBytesMain: runtimeState.usedBytesMain,
        cachedBytes: cache.cachedBytes,
        ceiling: runtimeState.ceilingBytes,
        zoom,
        pitch,
        unusedEvictable: cache.itemList.length > cache.usedSet.size,
        lastProgressAt: runtimeState.lastProgressAt,
      });
      runtimeState.errorTargetState = result.state;
      clearErrorTargetTimer();
      if (result.changed) {
        applyEffectiveErrorTarget(runtimeState.errorTargetState.effective);
        return;
      }
      if (result.retryInMs !== null) {
        runtimeState.errorTargetTimer = window.setTimeout(() => {
          runtimeState.errorTargetTimer = 0;
          runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
          requestRender();
        }, Math.max(1, Math.ceil(result.retryInMs)));
      }
    };

  const resetDeferredTiles: ThreeTilesRuntimeServices["resetDeferredTiles"] =
    () => {
      for (const tile of runtimeState.deferred) {
        if (tile.internal.loadingState === DEFERRED_TILE_LOADING_STATE) {
          tile.internal.loadingState = UNLOADED_LOADING_STATE;
        }
      }
      runtimeState.deferred.clear();
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
      resetEffectiveErrorTarget();
      resetDeferredTiles();
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
        clearHiddenWipeTimer();
        runtimeState.viewQualityAuditPasses = VIEW_QUALITY_AUDIT_PASSES;
        runtimeState.tiles.dispatchEvent({ type: "needs-update" });
        requestRender();
        return;
      }
      // Unused content goes at once; the tiles of the last view stay for a
      // quick return before the debounced full wipe.
      evictUnusedCacheItems();
      clearHiddenWipeTimer();
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
        assignTilePriority(tile);
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
          applyTileDeferral(tile, false);
        }
      }
      if (removed > 0 || runtimeState.meshDemandSweepPending) {
        runtimeState.tiles.dispatchEvent({ type: "needs-update" });
        requestRender();
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
        resetDeferredTiles();
        dependencies.requestShadowSelectionRefresh();
        runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
        requestRender();
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
        requestRender();
      }
    };

  const handleContextLost: ThreeTilesRuntimeServices["handleContextLost"] =
    () => {
      runtimeState.contextLost = true;
      applyRequestConcurrency();
    };

  const handleContextRestored: ThreeTilesRuntimeServices["handleContextRestored"] =
    () => {
      runtimeState.contextLost = false;
      runtimeState.lastMemoryCheck = Number.NEGATIVE_INFINITY;
      applyRequestConcurrency();
      if (!runtimeState.memoryAdmissionPaused) runDownloadQueues();
    };

  const applyTilesetMinResolution = createTilesetMinResolutionService(
    runtimeState,
    requestRender
  );

  const applyRequestConcurrency: ThreeTilesRuntimeServices["applyRequestConcurrency"] =
    () => {
      const cache = getRuntimeCache();
      if (!runtimeState.tiles || !cache) return;
      sampleMemoryPressure();
      runtimeState.normalParseConcurrency ??=
        runtimeState.tiles.parseQueue.maxJobs;
      const previousParseConcurrency = runtimeState.tiles.parseQueue.maxJobs;
      // GLTF scene/material creation touches the renderer thread. Bound motion
      // admission without pausing current-view coverage until pointer-up.
      const moving = runtimeState.map?.isMoving?.() === true;
      const zooming = runtimeState.map?.isZooming?.() === true;
      const motionParseLimit = zooming
        ? Math.min(1, MESH_MOTION_PARSE_CONCURRENCY)
        : MESH_MOTION_PARSE_CONCURRENCY;
      // Network admission is not main-thread parsing. A one-download zoom cap
      // serializes newly exposed coverage; retain the bounded motion pipeline
      // and backlog/memory guards while parsing still admits only one zoom job.
      const motionDownloadLimit = MESH_MOTION_DOWNLOAD_CONCURRENCY;
      const paused =
        runtimeState.memoryAdmissionPaused || runtimeState.loadingPaused;
      runtimeState.tiles.parseQueue.maxJobs = paused
        ? 0
        : moving && runtimeState.options.providesTerrain
        ? Math.min(motionParseLimit, runtimeState.normalParseConcurrency)
        : runtimeState.normalParseConcurrency;
      if (runtimeState.tiles.parseQueue.maxJobs > previousParseConcurrency) {
        // Changing the upstream concurrency limit does not wake a paused queue.
        // Defer the restart instead of parsing synchronously in an input event.
        runtimeState.tiles.parseQueue.scheduleJobRun();
      }
      const activeConcurrency = resolveRequestConcurrency({
        memoryPressure: paused,
        configured: runtimeState.payloadAwareConcurrency.getConcurrency(
          runtimeState.requestConcurrency
        ),
        ceilingBytes: runtimeState.ceilingBytes,
        cachedBytes: cache.cachedBytes,
        estimateBytes: runtimeState.bytesPredictor.globalEstimate(),
      });
      const parseItems = (runtimeState.tiles.parseQueue as RuntimePriorityQueue)
        .items;
      const parseBacklog = parseItems.length;
      let foregroundBacklog = parseBacklog;
      if (
        runtimeState.options.providesTerrain &&
        runtimeState.meshBaseCoverageReady &&
        parseBacklog >= MESH_PARSE_BACKLOG_HARD_LIMIT
      ) {
        // Decision: VIEWPORT-BACKPRESSURE-20260916 in TILES_COVERAGE.md.
        // Parked lower-priority buffers must not stop the downloads needed to
        // drain the foreground that parks them. Recheck ranks after each move.
        const priorities = new Map<Tile, number>();
        let highestPriority = Number.NEGATIVE_INFINITY;
        for (const tile of new Set([
          ...runtimeState.tiles.loadingTiles,
          ...parseItems,
        ])) {
          const priority = dependencies.getTileRequestPriority(
            tile as RuntimeTile
          );
          priorities.set(tile, priority);
          highestPriority = Math.max(highestPriority, priority);
        }
        if (Number.isFinite(highestPriority))
          foregroundBacklog = parseItems.filter(
            (tile) => priorities.get(tile)! >= highestPriority
          ).length;
      }
      const meshPipelineLimit = !runtimeState.meshBaseCoverageReady
        ? MESH_DOWNLOAD_CONCURRENCY
        : foregroundBacklog >= MESH_PARSE_BACKLOG_HARD_LIMIT
        ? 0
        : // Keep total parked-buffer pressure bounded even when foreground work
        // may bypass it; memory admission can still stop this lane completely.
        parseBacklog >= MESH_PARSE_BACKLOG_SOFT_LIMIT
        ? 4
        : MESH_DOWNLOAD_CONCURRENCY;
      const downloadConcurrency = runtimeState.options.providesTerrain
        ? Math.min(
            activeConcurrency,
            moving
              ? Math.min(motionDownloadLimit, meshPipelineLimit)
              : meshPipelineLimit
          )
        : runtimeState.map && isSharedThreeTerrainLoading(runtimeState.map)
        ? Math.min(
            TERRAIN_LOADING_CONTENT_BOOTSTRAP_CONCURRENCY,
            activeConcurrency
          )
        : activeConcurrency;
      // Network throughput is useful only while the downstream GLTF queue can
      // consume it. The former 42-64 request fan-out accumulated 225 parse jobs
      // and starved rendering. A bounded backlog gate keeps decoder and
      // browser-thread scene commits fed without building an unbounded blob wall.
      const previousDownloadConcurrency =
        runtimeState.tiles.downloadQueue.maxJobsPerOrigin;
      runtimeState.tiles.downloadQueue.maxJobsPerOrigin = downloadConcurrency;
      if (downloadConcurrency > previousDownloadConcurrency) {
        // Decision: CORRIDOR-REQUEST-CONCURRENCY-20260909 in engines/maplibre/README.md.
        // Updating the native limit does not wake an idle origin queue. Resume
        // asynchronously on capacity recovery, independent of the next traversal
        // or a different corridor completing its downloads/shadow work.
        for (const queue of getDownloadQueues()) queue.scheduleJobRun();
      }
    };

  const handleWireBytes: ThreeTilesRuntimeServices["handleWireBytes"] = (
    _url: string,
    response: Response
  ) => {
    const contentLength = Number(response.headers.get("content-length"));
    if (!Number.isFinite(contentLength) || contentLength <= 0) return;
    runtimeState.payloadAwareConcurrency.observePayload(contentLength);
    applyRequestConcurrency();
  };

  const scheduleRequestBackoffRecovery: ThreeTilesRuntimeServices["scheduleRequestBackoffRecovery"] =
    () => {
      if (!runtimeState.tiles) return;
      const delay =
        runtimeState.payloadAwareConcurrency.getCooldownRemainingMs();
      if (runtimeState.requestBackoffTimer) {
        window.clearTimeout(runtimeState.requestBackoffTimer);
        runtimeState.requestBackoffTimer = 0;
      }
      if (delay <= 0) return;
      runtimeState.requestBackoffTimer = window.setTimeout(() => {
        runtimeState.requestBackoffTimer = 0;
        applyRequestConcurrency();
        if (
          runtimeState.tiles &&
          runtimeState.tiles.downloadQueue.maxJobsPerOrigin > 0
        ) {
          runDownloadQueues();
          runtimeState.tiles.dispatchEvent({ type: "needs-update" });
        }
        requestRender();
      }, delay);
    };

  /**
   * D1: displayable REPLACE siblings outside the view and its prefetch margin
   * are parked in the FAILED state so upstream's parent gate treats them as
   * finished without a download; they are released once they come into view.
   */
  const applyTileDeferral: ThreeTilesRuntimeServices["applyTileDeferral"] = (
    tile: Tile,
    inView: boolean
  ) => {
    // Hierarchy expansion is asynchronous. Raw children are not queue-ready
    // yet; their process-node completion will wake a fresh coverage pass.
    if (!tile.internal || !tile.traversal) return;
    const runtimeTile = tile as RuntimeTile;
    const isDeferred = runtimeState.deferred.has(tile);
    const displayable =
      tile.internal.hasRenderableContent &&
      tile.refine === "REPLACE" &&
      !isUnconditionallyRefined(tile);
    const decision = shouldDeferTile({
      displayable,
      inView,
      inMargin:
        !inView &&
        (isDeferred || displayable) &&
        (!runtimeState.options.providesTerrain ||
          runtimeState.map?.isMoving?.())
          ? dependencies.isTileInPrefetchMargin(runtimeTile)
          : false,
      loadingState: tile.internal.loadingState,
      isDeferred,
    });
    if (decision === "defer") {
      tile.internal.loadingState = DEFERRED_TILE_LOADING_STATE;
      runtimeState.deferred.add(tile);
    } else if (decision === "undefer") {
      runtimeState.deferred.delete(tile);
      if (tile.internal.loadingState === DEFERRED_TILE_LOADING_STATE) {
        tile.internal.loadingState = UNLOADED_LOADING_STATE;
      }
    }
  };

  const assignTilePriority: ThreeTilesRuntimeServices["assignTilePriority"] = (
    tile: RuntimeTile
  ) => {
    tile.cameraPriority = dependencies.getTileRequestPriority(tile);
    const bounds = tile.engineData?.boundingVolume;
    let inMainFrustum = tile.traversal?.inFrustum ?? false;
    let centerness = 0;
    if (bounds && runtimeState.viewFrustumsReady && runtimeState.tiles) {
      inMainFrustum = bounds.intersectsFrustum(runtimeState.tileViewFrustum);
      centerness = dependencies.getTileCenterness(bounds);
    }
    tile.priority = deriveTilePriority({
      improvesInitialView:
        runtimeState.options.providesTerrain &&
        inMainFrustum &&
        !!tile.parent &&
        dependencies.getTileScreenError(tile.parent as RuntimeTile) >
          initialEffectiveErrorTarget(),
      fillsViewCoverage:
        runtimeState.options.providesTerrain &&
        inMainFrustum &&
        !hasDisplayedAncestor(tile, runtimeState.displayedMeshFrontier),
      distanceFromCamera: runtimeState.options.providesTerrain
        ? tile.traversal?.distanceFromCamera ?? Number.POSITIVE_INFINITY
        : undefined,
      depth: tile.internal?.depth ?? 0,
      inMainFrustum,
      isExternalTileset: tile.internal?.hasUnrenderableContent ?? false,
      centerness,
      foveationWeight: runtimeState.foveationWeight,
      isExtentFloor:
        runtimeState.tiles?.loadAncestors === false &&
        isExtentFloorTile(tile, runtimeState.extentGeometricError) &&
        (tile.children ?? []).every(
          (child) => child.geometricError < runtimeState.extentGeometricError
        ),
      shadowReceiverCenterness: runtimeState.shadowSelectionEnabled
        ? tile.shadowReceiverCenterness
        : undefined,
      shadowLightFacing: runtimeState.shadowSelectionEnabled
        ? tile.shadowLightFacing
        : undefined,
    });
  };

  /** Refresh the download and parse order for the current view every frame. */
  const prioritizeQueuedTiles: ThreeTilesRuntimeServices["prioritizeQueuedTiles"] =
    () => {
      if (!runtimeState.tiles) return;
      for (const queue of getDownloadQueues()) {
        for (const tile of queue.items) assignTilePriority(tile as RuntimeTile);
      }
      const parseQueue = runtimeState.tiles.parseQueue as RuntimePriorityQueue;
      for (const tile of parseQueue.items)
        assignTilePriority(tile as RuntimeTile);
    };

  const setErrorTarget: ThreeTilesRuntimeServices["setErrorTarget"] = (
    errorTarget: number,
    initialErrorTarget?: number
  ) => {
    const nextErrorTarget = clamp(
      errorTarget,
      TILES_ERROR_TARGET_MIN_PIXELS,
      TILES_ERROR_TARGET_MAX_PIXELS
    );
    // shadow-scene re-applies the same requested target on every content
    // change; only a changed request resets a relaxed effective target.
    const nextInitial =
      initialErrorTarget !== undefined && Number.isFinite(initialErrorTarget)
        ? clamp(
            initialErrorTarget,
            nextErrorTarget,
            TILES_ERROR_TARGET_MAX_PIXELS
          )
        : runtimeState.options.baseErrorTargetPixels;
    const initialChanged =
      nextInitial !== runtimeState.options.baseErrorTargetPixels;
    if (
      runtimeState.requestedErrorTarget === nextErrorTarget &&
      !initialChanged
    )
      return;
    runtimeState.options.baseErrorTargetPixels = nextInitial;
    if (initialChanged) {
      runtimeState.meshInitialReserveSettled = false;
      runtimeState.appliedTilesetMinResolutionPx = Number.NaN;
    }
    runtimeState.requestedErrorTarget = nextErrorTarget;
    // A new request restarts the memory-adaptive target from it.
    runtimeState.memoryErrorTarget = nextErrorTarget;
    runtimeState.memoryErrorTargetChangedAt = 0;
    runtimeState.meshDemandSweepPending =
      runtimeState.options.providesTerrain === true;
    resetDeferredTiles();
    resetEffectiveErrorTarget();
    dependencies.requestShadowSelectionRefresh();
    runtimeState.viewQualityAuditPasses = VIEW_QUALITY_AUDIT_PASSES;
    runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
    requestRender();
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
      }
    );
    resetEffectiveErrorTarget();
    dependencies.requestShadowSelectionRefresh();
    applyCacheBudget();
    applyRequestConcurrency();
    runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
  };

  const setRequestConcurrency: ThreeTilesRuntimeServices["setRequestConcurrency"] =
    (jobs: number) => {
      const nextConcurrency = Math.max(0, Math.floor(jobs));
      const changed = nextConcurrency !== runtimeState.requestConcurrency;
      runtimeState.requestConcurrency = nextConcurrency;
      if (!runtimeState.tiles) return;
      applyRequestConcurrency();
      if (runtimeState.tiles.downloadQueue.maxJobsPerOrigin > 0) {
        runDownloadQueues();
      }
      if (changed) runtimeState.tiles.dispatchEvent({ type: "needs-update" });
    };
  return {
    initialEffectiveErrorTarget,
    requestRender,
    getDownloadQueues,
    runDownloadQueues,
    clearErrorTargetTimer,
    clearKickstartTimer,
    clearHiddenWipeTimer,
    getRuntimeCache,
    getRequestDemand,
    notifyRequestStateChange,
    isPipelineIdle,
    measureUsedBytesMain,
    applyEffectiveErrorTarget,
    resetEffectiveErrorTarget,
    applyErrorTargetPolicy,
    resetDeferredTiles,
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
    handleContextRestored,
    applyRequestConcurrency,
    applyTilesetMinResolution,
    handleWireBytes,
    scheduleRequestBackoffRecovery,
    applyTileDeferral,
    assignTilePriority,
    prioritizeQueuedTiles,
    setErrorTarget,
    setCacheBudget,
    setRequestConcurrency,
  };
}
