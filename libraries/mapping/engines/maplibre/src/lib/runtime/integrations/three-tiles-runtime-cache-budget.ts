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
  resolveTilesCacheBounds,
  resolveTilesCacheCeiling,
} from "../../core/tile-cache-policy";
import { TILES_LOAD_POLICY } from "../../core/tile-load-config";
import type { ThreeTilesCacheState } from "./three-tiles-runtime-cache";
import {
  DEFAULT_CACHE_MAX_ITEMS,
  DEFAULT_CACHE_MIN_ITEMS,
} from "./three-tiles-runtime-config";
import type { ThreeTilesRuntimeServices } from "./three-tiles-runtime-context";
import type { CacheBudgetOptions } from "./three-tiles-runtime-types";

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
  >
) {
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
      const residentCache = dependencies.getRuntimeCache();
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
      const cached = dependencies.getRuntimeCache()?.cachedBytes ?? 0;
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
      const peak = dependencies.getRuntimeCache()?.cachedBytes ?? 0;
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
