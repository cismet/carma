import { TilesRenderer } from "3d-tiles-renderer";
import { type Tile } from "3d-tiles-renderer/core";

import {
  resolveTileDownloadConcurrency,
  resolveTileParseConcurrency,
} from "../../core/tile-scheduling-policy";
import { isSharedThreeTerrainLoading } from "./shared-three-terrain-registry";
import {
  DEFERRED_TILE_LOADING_STATE,
  deriveTilePriority,
  initialMeshLoadError,
  isExtentFloorTile,
  resolveRequestConcurrency,
  shouldDeferTile,
} from "./three-tiles-load-policy";
import { hasDisplayedAncestor } from "./three-tiles-mesh-frontier";
import { createThreeTilesCache } from "./three-tiles-runtime-cache";
import {
  MESH_DOWNLOAD_CONCURRENCY,
  MESH_MOTION_DOWNLOAD_CONCURRENCY,
  MESH_MOTION_PARSE_CONCURRENCY,
  MESH_PARSE_BACKLOG_HARD_LIMIT,
  MESH_PARSE_BACKLOG_SOFT_LIMIT,
  TERRAIN_LOADING_CONTENT_BOOTSTRAP_CONCURRENCY,
} from "./three-tiles-runtime-config";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import { createTilesetMinResolutionService } from "./three-tiles-runtime-floor";
import { createThreeTilesQuality } from "./three-tiles-runtime-quality";
import type {
  RuntimePriorityQueue,
  RuntimeTile,
} from "./three-tiles-runtime-types";
import {
  isUnconditionallyRefined,
  UNLOADED_LOADING_STATE,
} from "./three-tiles-runtime-vendor";

/** loading responsibility of the shared 3D Tiles runtime. */
export function createThreeTilesLoading(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    | "options"
    | "requestedErrorTarget"
    | "configuredErrorTarget"
    | "errorTargetOverride"
    | "map"
    | "tiles"
    | "errorTargetTimer"
    | "kickstartTimer"
    | "hiddenWipeTimer"
    | "disposed"
    | "runtimeVisible"
    | "shadowView"
    | "meshInitialBasePassDone"
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
    | "cacheCeilingStorage"
    | "cacheCeilingMemory"
    | "learnedCeilingBytes"
    | "cacheCeilingPeakWrittenAt"
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
    | "applyPendingShadowView"
    | "isTileInMainView"
    | "getTileCameraDemand"
    | "getTileRequestPriority"
    | "maybeEnableShadowSelection"
    | "isTileInPrefetchMargin"
    | "getTileCenterness"
    | "getTileScreenError"
  >
) {
  const {
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
  } = createThreeTilesCache(runtimeState, {
    ...dependencies,
    requestRender: (...args) => requestRender(...args),
    runDownloadQueues: (...args) => runDownloadQueues(...args),
    clearHiddenWipeTimer: (...args) => clearHiddenWipeTimer(...args),
    resetEffectiveErrorTarget: (...args) => resetEffectiveErrorTarget(...args),
    resetDeferredTiles: (...args) => resetDeferredTiles(...args),
    applyRequestConcurrency: (...args) => applyRequestConcurrency(...args),
    applyTileDeferral: (...args) => applyTileDeferral(...args),
    assignTilePriority: (...args) => assignTilePriority(...args),
  });
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

  const {
    applyEffectiveErrorTarget,
    resetEffectiveErrorTarget,
    applyErrorTargetPolicy,
    setErrorTarget,
    setErrorTargetOverride,
    getErrorTarget,
  } = createThreeTilesQuality(runtimeState, {
    ...dependencies,
    initialEffectiveErrorTarget: (...args) =>
      initialEffectiveErrorTarget(...args),
    requestRender: (...args) => requestRender(...args),
    clearErrorTargetTimer: (...args) => clearErrorTargetTimer(...args),
    getRuntimeCache: (...args) => getRuntimeCache(...args),
    isPipelineIdle: (...args) => isPipelineIdle(...args),
    resetDeferredTiles: (...args) => resetDeferredTiles(...args),
  });
  const resetDeferredTiles: ThreeTilesRuntimeServices["resetDeferredTiles"] =
    () => {
      for (const tile of runtimeState.deferred) {
        if (tile.internal.loadingState === DEFERRED_TILE_LOADING_STATE) {
          tile.internal.loadingState = UNLOADED_LOADING_STATE;
        }
      }
      runtimeState.deferred.clear();
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
      const paused =
        runtimeState.memoryAdmissionPaused || runtimeState.loadingPaused;
      runtimeState.tiles.parseQueue.maxJobs = resolveTileParseConcurrency({
        paused,
        moving,
        zooming,
        providesTerrain: !!runtimeState.options.providesTerrain,
        normal: runtimeState.normalParseConcurrency,
        motionLimit: MESH_MOTION_PARSE_CONCURRENCY,
      });
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
      const downloadConcurrency = resolveTileDownloadConcurrency(
        {
          active: activeConcurrency,
          providesTerrain: !!runtimeState.options.providesTerrain,
          moving,
          baseCoverageReady: runtimeState.meshBaseCoverageReady,
          parseBacklog,
          foregroundBacklog,
          sharedTerrainLoading:
            !runtimeState.options.providesTerrain &&
            !!runtimeState.map &&
            isSharedThreeTerrainLoading(runtimeState.map),
        },
        {
          mesh: MESH_DOWNLOAD_CONCURRENCY,
          motion: MESH_MOTION_DOWNLOAD_CONCURRENCY,
          backlogHard: MESH_PARSE_BACKLOG_HARD_LIMIT,
          backlogSoft: MESH_PARSE_BACKLOG_SOFT_LIMIT,
          backgroundBacklog: 4,
          terrainBootstrap: TERRAIN_LOADING_CONTENT_BOOTSTRAP_CONCURRENCY,
        }
      );
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
    recordCacheCeilingFailure,
    endCacheCeilingSession,
    handleContextRestored,
    applyRequestConcurrency,
    applyTilesetMinResolution,
    handleWireBytes,
    scheduleRequestBackoffRecovery,
    applyTileDeferral,
    assignTilePriority,
    prioritizeQueuedTiles,
    setErrorTarget,
    setErrorTargetOverride,
    getErrorTarget,
    setCacheBudget,
    setRequestConcurrency,
  };
}
