import { synchronizeSharedCacheCeiling } from "./three-tiles-shared-cache-ceiling";
import {
  CACHE_CEILING_FAILURE_FRACTION,
  EMPTY_CACHE_CEILING_MEMORY,
  endCacheCeilingSession as endCacheCeilingSessionMemory,
  learnCacheCeiling,
  normalizeCacheCeilingMemory,
  readCacheCeilingMemory,
  recordCacheCeilingPeak,
  writeCacheCeilingMemory,
} from "./three-tiles-cache-ceiling-memory";
import {
  resolveTilesCacheBounds,
  resolveTilesCacheCeiling,
  resolveTilesCacheMaximum,
  nextTilesCacheCeiling,
} from "../../core/tile-cache-policy";
import { LOADED_LOADING_STATE } from "./three-tiles-runtime-vendor";
import { TILES_LOAD_POLICY } from "../../core/tile-load-config";
import type { ThreeTilesCacheState } from "./three-tiles-runtime-cache";
import {
  MESH_ALLOCATION_RECOVERY_PHASE,
  DEFAULT_CACHE_MAX_ITEMS,
  DEFAULT_CACHE_MIN_ITEMS,
} from "./three-tiles-runtime-config";
import type { ThreeTilesRuntimeServices } from "./three-tiles-runtime-context";
import type {
  CacheBudgetOptions,
  RuntimePriorityQueue,
  RuntimeTile,
} from "./three-tiles-runtime-types";

/** Applies cache limits and learns a lower ceiling after memory failures. */
export function createThreeTilesCacheBudget(
  runtimeState: ThreeTilesCacheState,
  dependencies: Pick<
    ThreeTilesRuntimeServices,
    | "getRuntimeCache"
    | "evictUnusedCacheItems"
    | "applyRequestConcurrency"
    | "requestRender"
    | "resetEffectiveErrorTarget"
    | "requestShadowSelectionRefresh"
    | "runDownloadQueues"
    | "scheduleSettledMeshAudit"
  >
) {
  // Context and allocation notifications can describe the same failed GPU work.
  // This episode stays local and ends only when the context is restored.
  let contextLossLearned = false;
  let lastSharedCeilingCheck = Number.NEGATIVE_INFINITY;
  const applyCacheBudget: ThreeTilesRuntimeServices["applyCacheBudget"] =
    () => {
      const cache = dependencies.getRuntimeCache();
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
      const cache = dependencies.getRuntimeCache();
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
      if (
        now - lastSharedCeilingCheck >=
        TILES_LOAD_POLICY.memoryCheckIntervalMs
      ) {
        lastSharedCeilingCheck = now;
        const shared = synchronizeSharedCacheCeiling(
          runtimeState.cacheCeilingStorage,
          runtimeState.cacheCeilingMemory
        );
        if (shared && shared !== runtimeState.cacheCeilingMemory) {
          runtimeState.cacheCeilingMemory = shared;
          runtimeState.learnedCeilingBytes = shared.learnedBytes;
          const ceiling = resolveTilesCacheMaximum(
            runtimeState.deviceProfile,
            {
              cacheBudgetBytes: runtimeState.styleCacheBudgetBytes,
              cacheOverflowBytes: runtimeState.styleCacheOverflowBytes,
            },
            shared.learnedBytes
          );
          if (ceiling < runtimeState.ceilingBytes) {
            runtimeState.ceilingBytes = ceiling;
            runtimeState.meshDemandSweepPending = true;
            applyCacheBudget();
            dependencies.scheduleSettledMeshAudit();
            dependencies.requestRender();
          }
        }
      }
      const residentCache = dependencies.getRuntimeCache();
      if (runtimeState.cacheCeilingMemory && residentCache) {
        runtimeState.cacheCeilingMemory = recordCacheCeilingPeak(
          runtimeState.cacheCeilingMemory,
          residentCache.cachedBytes
        );
      }
      const recovery = runtimeState.allocationRecovery;
      if (
        runtimeState.allocationFailed &&
        recovery &&
        !runtimeState.contextLost &&
        now >= recovery.retryAt &&
        residentCache &&
        runtimeState.tiles &&
        (runtimeState.tiles.parseQueue as RuntimePriorityQueue).currJobs ===
          0 &&
        [...runtimeState.tiles.downloadQueue.originQueues.values()].every(
          (queue) => (queue as RuntimePriorityQueue).currJobs === 0
        )
      ) {
        const estimate = runtimeState.bytesPredictor.globalEstimate();
        // Far below the reduced ceiling the failure can be a temporary decode
        // buffer, even while a modest visible cut is fully pinned. Drain native
        // work and back off there; near the ceiling require actual reclamation.
        const lowResidency =
          recovery.failureBytes <=
          Math.max(
            estimate,
            TILES_LOAD_POLICY.cacheDriftSlackMinBytes,
            runtimeState.ceilingBytes * 0.5
          );
        const reclaimed =
          residentCache.cachedBytes <=
          recovery.failureBytes *
            (lowResidency ? 1 : CACHE_CEILING_FAILURE_FRACTION);
        const probeFits =
          residentCache.cachedBytes + estimate <=
          runtimeState.ceilingBytes * TILES_LOAD_POLICY.cacheRetentionFraction;
        if (reclaimed && probeFits) {
          runtimeState.allocationFailed = false;
          recovery.phase = MESH_ALLOCATION_RECOVERY_PHASE.PROBING;
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
        else dependencies.evictUnusedCacheItems();
        // Drop unfinished requests/parse buffers, never the visible replacement
        // parents or loaded caster coverage. Paused queues must not pin blobs.
        if (runtimeState.tiles && !runtimeState.options.providesTerrain) {
          for (const tile of [...runtimeState.tiles.loadingTiles]) {
            if (!runtimeState.tiles.visibleTiles.has(tile))
              runtimeState.tiles.lruCache.remove(tile);
          }
        }
      }
      if (runtimeState.options.providesTerrain && residentCache) {
        let loadedResidentBytes = 0;
        for (const tile of residentCache.itemList)
          if (
            tile.internal?.loadingState === LOADED_LOADING_STATE &&
            (tile as RuntimeTile).engineData?.scene
          )
            loadedResidentBytes += residentCache.getMemoryUsage(tile);
        runtimeState.loadedResidentBytes = loadedResidentBytes;
        const grown = nextTilesCacheCeiling({
          current: runtimeState.ceilingBytes,
          maximum: resolveTilesCacheMaximum(
            runtimeState.deviceProfile,
            {
              cacheBudgetBytes: runtimeState.styleCacheBudgetBytes,
              cacheOverflowBytes: runtimeState.styleCacheOverflowBytes,
            },
            runtimeState.learnedCeilingBytes
          ),
          loadedResidentBytes,
          workOutstanding:
            !(
              runtimeState.lastActiveViewsConverged ??
              runtimeState.lastMainViewConverged
            ) ||
            runtimeState.memoryErrorTarget >
              runtimeState.requestedErrorTarget ||
            (runtimeState.extentGeometricError > 0 &&
              (!runtimeState.extentFloorArmed ||
                runtimeState.extentFloorPending > 0)),
          healthy:
            !runtimeState.memoryAdmissionPaused &&
            (!recovery ||
              recovery.phase === MESH_ALLOCATION_RECOVERY_PHASE.RECOVERED),
          now,
          lastGrowthAt: runtimeState.lastCacheGrowthAt,
        });
        if (grown > runtimeState.ceilingBytes) {
          runtimeState.ceilingBytes = grown;
          runtimeState.lastCacheGrowthAt = now;
          // New cache headroom justifies one finer quality attempt. Repeated
          // audits without a larger grant cannot reopen the same request burst.
          runtimeState.memoryErrorTarget = Math.max(
            runtimeState.requestedErrorTarget,
            runtimeState.memoryErrorTarget / TILES_LOAD_POLICY.memoryTargetStep
          );
          runtimeState.memoryErrorTargetChangedAt = now;
          runtimeState.meshDemandSweepPending = true;
          applyCacheBudget();
          dependencies.requestShadowSelectionRefresh();
          runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
          dependencies.requestRender();
        }
      }
      if (wasPaused && !runtimeState.memoryAdmissionPaused) {
        runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
        dependencies.requestRender();
      }
    };

  const handleContextLost: ThreeTilesRuntimeServices["handleContextLost"] =
    () => {
      if (runtimeState.contextLost) return;
      runtimeState.contextLost = true;
      recordCacheCeilingFailure("context-lost");
      dependencies.applyRequestConcurrency();
    };

  const persistCacheCeilingMemory = () => {
    if (runtimeState.cacheCeilingMemory)
      writeCacheCeilingMemory(
        runtimeState.cacheCeilingStorage,
        runtimeState.cacheCeilingMemory
      );
  };
  const recordCacheCeilingFailure: ThreeTilesRuntimeServices["recordCacheCeilingFailure"] =
    (reason) => {
      const cached = dependencies.getRuntimeCache()?.cachedBytes ?? 0;
      const allocationWaiting =
        runtimeState.allocationRecovery?.phase ===
        MESH_ALLOCATION_RECOVERY_PHASE.WAITING;
      if (reason === "allocation" && runtimeState.options.providesTerrain) {
        if (allocationWaiting) {
          // Multiple jobs can fail in one paused episode. Preserve its first
          // deadline rather than pushing recovery away on every notification.
          runtimeState.meshDemandSweepPending = true;
          dependencies.scheduleSettledMeshAudit();
          return;
        }
        const failures = (runtimeState.allocationRecovery?.failures ?? 0) + 1;
        runtimeState.allocationRecovery = {
          failures,
          retryAt:
            performance.now() +
            Math.min(30_000, 1_000 * 2 ** Math.min(failures - 1, 5)),
          failureBytes: cached,
          phase: MESH_ALLOCATION_RECOVERY_PHASE.WAITING,
        };
        runtimeState.meshDemandSweepPending = true;
        // Failure can occur before the frame reaches its normal audit setup.
        // Arm that existing wakeup here, including when every queue is paused.
        dependencies.scheduleSettledMeshAudit();
      }
      if (reason === "context-lost" && allocationWaiting) {
        contextLossLearned = true;
        return;
      }
      if (runtimeState.contextLost && contextLossLearned) return;
      // A lost context with a mostly empty cache is a GPU reset or a
      // backgrounded tab, not a memory signal; only a well-filled cache learns.
      if (reason === "context-lost" && cached < runtimeState.ceilingBytes * 0.5)
        return;
      if (runtimeState.contextLost) contextLossLearned = true;
      const lesson = learnCacheCeiling(
        runtimeState.cacheCeilingStorage
          ? normalizeCacheCeilingMemory(
              readCacheCeilingMemory(runtimeState.cacheCeilingStorage)
            )
          : runtimeState.cacheCeilingMemory ?? EMPTY_CACHE_CEILING_MEMORY,
        runtimeState.ceilingBytes * CACHE_CEILING_FAILURE_FRACTION,
        reason
      );
      if (lesson.learnedBytes === runtimeState.learnedCeilingBytes) return;
      runtimeState.learnedCeilingBytes = lesson.learnedBytes;
      if (runtimeState.cacheCeilingMemory) {
        runtimeState.cacheCeilingMemory = {
          ...lesson,
          probe: runtimeState.cacheCeilingMemory.probe,
        };
        persistCacheCeilingMemory();
      }
      runtimeState.ceilingBytes = Math.min(
        runtimeState.ceilingBytes,
        resolveTilesCacheMaximum(
          runtimeState.deviceProfile,
          {
            cacheBudgetBytes: runtimeState.styleCacheBudgetBytes,
            cacheOverflowBytes: runtimeState.styleCacheOverflowBytes,
          },
          runtimeState.learnedCeilingBytes
        )
      );
      applyCacheBudget();
    };
  const endCacheCeilingSession: ThreeTilesRuntimeServices["endCacheCeilingSession"] =
    () => {
      if (!runtimeState.cacheCeilingMemory) return;
      const shared = runtimeState.cacheCeilingStorage
        ? normalizeCacheCeilingMemory(
            readCacheCeilingMemory(runtimeState.cacheCeilingStorage)
          )
        : runtimeState.cacheCeilingMemory;
      // A run under an older limit cannot recover a newer failure lesson.
      if (shared.learnedBytes !== runtimeState.learnedCeilingBytes) return;
      const peak = dependencies.getRuntimeCache()?.cachedBytes ?? 0;
      runtimeState.cacheCeilingMemory = endCacheCeilingSessionMemory(
        recordCacheCeilingPeak(
          { ...shared, probe: runtimeState.cacheCeilingMemory.probe },
          peak
        )
      );
      persistCacheCeilingMemory();
    };

  const handleContextRestored: ThreeTilesRuntimeServices["handleContextRestored"] =
    () => {
      runtimeState.contextLost = false;
      contextLossLearned = false;
      runtimeState.lastMemoryCheck = Number.NEGATIVE_INFINITY;
      dependencies.applyRequestConcurrency();
      if (!runtimeState.memoryAdmissionPaused) dependencies.runDownloadQueues();
    };

  const setCacheBudget: ThreeTilesRuntimeServices["setCacheBudget"] = (
    bytes?: number,
    cacheOptions?: CacheBudgetOptions
  ) => {
    const budget =
      bytes === undefined ? undefined : Math.max(0, Math.floor(bytes));
    const overflow =
      cacheOptions?.overflowBytes === undefined
        ? undefined
        : Math.max(0, Math.floor(cacheOptions.overflowBytes));
    const changed =
      budget !== runtimeState.styleCacheBudgetBytes ||
      overflow !== runtimeState.styleCacheOverflowBytes;
    // Debug controls replay this setter with unrelated settings. An identical
    // budget must not release an allocation pause or restart quality work.
    if (!changed) return;
    runtimeState.allocationFailed = false;
    runtimeState.allocationRecovery = null;
    runtimeState.lastMemoryCheck = Number.NEGATIVE_INFINITY;
    runtimeState.styleCacheBudgetBytes = budget;
    runtimeState.styleCacheOverflowBytes = overflow;
    const style = { cacheBudgetBytes: budget, cacheOverflowBytes: overflow };
    runtimeState.ceilingBytes = resolveTilesCacheCeiling(
      runtimeState.deviceProfile,
      style,
      runtimeState.learnedCeilingBytes
    );
    runtimeState.lastCacheGrowthAt = performance.now();
    dependencies.resetEffectiveErrorTarget();
    dependencies.requestShadowSelectionRefresh();
    applyCacheBudget();
    dependencies.applyRequestConcurrency();
    runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
  };

  return {
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
