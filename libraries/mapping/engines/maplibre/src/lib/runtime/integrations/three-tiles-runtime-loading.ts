import { notifyTileResponse } from "./tile-response-observers";
import { type Tile } from "3d-tiles-renderer/core";

import {
  DEFERRED_TILE_LOADING_STATE,
  deriveTilePriority,
  shouldDeferTile,
} from "../../core/tile-request-policy";
import {
  initialMeshLoadError,
  isExtentFloorTile,
} from "../../core/mesh-error-policy";
import { hasDisplayedAncestor } from "../../core/mesh-tile-coverage";
import { createThreeTilesCache } from "./three-tiles-runtime-cache";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import { createTilesetMinResolutionService } from "./three-tiles-runtime-floor";
import { createThreeTilesQuality } from "./three-tiles-runtime-quality";
import { createThreeTilesRequestActivity } from "./three-tiles-runtime-request-activity";
import { createThreeTilesRequestConcurrency } from "./three-tiles-runtime-request-concurrency";
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
    | "meshInitialHandoverDone"
    | "tileCameraDemand"
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
    | "meshInitialBasePassDone"
    | "meshInitialReserveSettled"
    | "extentFloorArmed"
    | "extentGeometricError"
    | "extentFloorPending"
    | "extentFloorAuditPending"
    | "displayedMeshFrontier"
    | "committedMeshCasterFrontier"
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
    | "getTileObserverDemand"
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
            runtimeState.options.baseErrorTargetPixels,
            !runtimeState.meshInitialBasePassDone,
            runtimeState.options.firstImageErrorTargetPixels
          )
        : runtimeState.requestedErrorTarget;

  const {
    requestRender,
    getDownloadQueues,
    runDownloadQueues,
    clearErrorTargetTimer,
    clearKickstartTimer,
    clearHiddenWipeTimer,
    getRequestDemand,
    notifyRequestStateChange,
    isPipelineIdle,
    measureUsedBytesMain,
  } = createThreeTilesRequestActivity(runtimeState);

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

  const { applyRequestConcurrency } = createThreeTilesRequestConcurrency(
    runtimeState,
    {
      ...dependencies,
      getRuntimeCache,
      sampleMemoryPressure,
      getDownloadQueues,
    }
  );

  const handleWireBytes: ThreeTilesRuntimeServices["handleWireBytes"] = (
    url: string,
    response: Response
  ) => {
    const contentLength = Number(response.headers.get("content-length"));
    if (runtimeState.options.diagnostics && runtimeState.tiles)
      notifyTileResponse(runtimeState.tiles, { url, contentLength });
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
      // loadingTiles also owns requests routed through the private metadata
      // queues. Refresh them and active requests with the same current view.
      const pending = new Set<Tile>(runtimeState.tiles.loadingTiles);
      for (const queue of getDownloadQueues())
        for (const tile of queue.items) pending.add(tile);
      for (const tile of (runtimeState.tiles.parseQueue as RuntimePriorityQueue)
        .items)
        pending.add(tile);
      for (const tile of (
        runtimeState.tiles.processNodeQueue as RuntimePriorityQueue
      ).items) {
        pending.add(tile);
        if (tile.parent) pending.add(tile.parent);
      }
      for (const tile of [...pending])
        if (tile.internal.hasUnrenderableContent && tile.parent)
          pending.add(tile.parent);
      for (const tile of pending) assignTilePriority(tile as RuntimeTile);
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
