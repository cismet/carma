import { TilesRenderer } from "3d-tiles-renderer";
import { type Tile } from "3d-tiles-renderer/core";

import { clamp } from "@carma-commons/math";

import { isSharedThreeTerrainLoading } from "./shared-three-terrain-registry";
import { readOrientedTileBounds } from "./three-tiles-bounds";
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
} from "./three-tiles-load-policy";
import { isMeshCoveredByLoadedChildren } from "./three-tiles-mesh-frontier";
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
} from "./three-tiles-runtime-config";
import {
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
    | "maybeEnableShadowSelection"
    | "isTileInPrefetchMargin"
    | "getTileCenterness"
  >
) {
  const initialEffectiveErrorTarget: ThreeTilesRuntimeServices["initialEffectiveErrorTarget"] =
    () =>
      runtimeState.options.providesTerrain
        ? initialMeshLoadError(runtimeState.requestedErrorTarget)
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
    (): RuntimeLruCache | null =>
      runtimeState.tiles
        ? (runtimeState.tiles.lruCache as RuntimeLruCache)
        : null;

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
      // Mesh surfaces fill the viewport at 16 px and then deterministically
      // halve the error. The displayed parent cut is retained while children
      // arrive; cache pressure may never relax the user's final mesh target.
      if (runtimeState.options.providesTerrain) {
        if (
          runtimeState.lastMainViewConverged &&
          runtimeState.effectiveErrorTarget > runtimeState.requestedErrorTarget
        ) {
          applyEffectiveErrorTarget(
            Math.max(
              runtimeState.requestedErrorTarget,
              runtimeState.effectiveErrorTarget / 2
            )
          );
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

  /** Full wipe of a tab that stayed hidden: memory back, state reset. */
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
      for (const tile of [...cache.itemSet.keys()]) cache.remove(tile);
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
    if (!runtimeState.viewFrustumsReady || dependencies.isTileInMainView(tile))
      return true;
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
      runtimeState.tileBoundsTransform
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
        const replacedParent =
          underPressure &&
          !runtimeState.tiles.activeTiles.has(tile) &&
          isMeshCoveredByLoadedChildren(tile, runtimeState.tiles.visibleTiles);
        // Paused parsing must not retain finer pending blobs behind the stage
        // that is waiting to publish. Release only unnecessary uncommitted work;
        // the complete visible receiver/caster cut remains pinned throughout.
        if (!replacedParent && isRequiredMeshTile(tile as RuntimeTile))
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

  const applyRequestConcurrency: ThreeTilesRuntimeServices["applyRequestConcurrency"] =
    () => {
      const cache = getRuntimeCache();
      if (!runtimeState.tiles || !cache) return;
      sampleMemoryPressure();
      runtimeState.normalParseConcurrency ??=
        runtimeState.tiles.parseQueue.maxJobs;
      const previousParseConcurrency = runtimeState.tiles.parseQueue.maxJobs;
      // DRACO decode is already worker-backed, but GLTF scene/material creation
      // must touch Three objects on the renderer thread. Keep one such job while
      // dragging; restore normal parallelism as soon as input ends.
      runtimeState.tiles.parseQueue.maxJobs = runtimeState.memoryAdmissionPaused
        ? 0
        : runtimeState.map?.isMoving?.() && runtimeState.options.providesTerrain
        ? 1
        : runtimeState.normalParseConcurrency;
      if (runtimeState.tiles.parseQueue.maxJobs > previousParseConcurrency) {
        // Changing the upstream concurrency limit does not wake a paused queue.
        // Defer the restart instead of parsing synchronously in an input event.
        runtimeState.tiles.parseQueue.scheduleJobRun();
      }
      const activeConcurrency = resolveRequestConcurrency({
        memoryPressure: runtimeState.memoryAdmissionPaused,
        configured: runtimeState.payloadAwareConcurrency.getConcurrency(
          runtimeState.requestConcurrency
        ),
        ceilingBytes: runtimeState.ceilingBytes,
        cachedBytes: cache.cachedBytes,
        estimateBytes: runtimeState.bytesPredictor.globalEstimate(),
      });
      const parseBacklog = (
        runtimeState.tiles.parseQueue as RuntimePriorityQueue
      ).items.length;
      const meshPipelineLimit =
        parseBacklog >= MESH_PARSE_BACKLOG_HARD_LIMIT
          ? 0
          : parseBacklog >= MESH_PARSE_BACKLOG_SOFT_LIMIT
          ? 4
          : MESH_DOWNLOAD_CONCURRENCY;
      const downloadConcurrency = runtimeState.options.providesTerrain
        ? Math.min(
            activeConcurrency,
            runtimeState.map?.isMoving?.()
              ? TERRAIN_LOADING_CONTENT_BOOTSTRAP_CONCURRENCY
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
      runtimeState.tiles.downloadQueue.maxJobsPerOrigin = downloadConcurrency;
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
    const bounds = tile.engineData?.boundingVolume;
    let inMainFrustum = tile.traversal?.inFrustum ?? false;
    let centerness = 0;
    if (bounds && runtimeState.viewFrustumsReady && runtimeState.tiles) {
      inMainFrustum = bounds.intersectsFrustum(runtimeState.tileViewFrustum);
      centerness = dependencies.getTileCenterness(bounds);
    }
    tile.priority = deriveTilePriority({
      distanceFromCamera: runtimeState.options.providesTerrain
        ? tile.traversal?.distanceFromCamera ?? Number.POSITIVE_INFINITY
        : undefined,
      depth: tile.internal?.depth ?? 0,
      inMainFrustum,
      isExternalTileset: tile.internal?.hasUnrenderableContent ?? false,
      centerness,
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
    errorTarget: number
  ) => {
    const nextErrorTarget = clamp(
      errorTarget,
      TILES_ERROR_TARGET_MIN_PIXELS,
      TILES_ERROR_TARGET_MAX_PIXELS
    );
    // shadow-scene re-applies the same requested target on every content
    // change; only a changed request resets a relaxed effective target.
    if (runtimeState.requestedErrorTarget === nextErrorTarget) return;
    runtimeState.requestedErrorTarget = nextErrorTarget;
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
