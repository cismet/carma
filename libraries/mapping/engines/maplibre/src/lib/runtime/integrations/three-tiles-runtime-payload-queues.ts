import {
  DownloadPriorityQueue,
  PriorityQueue,
  type Tile,
} from "3d-tiles-renderer/core";

import { isTileQueueEntryRunnable } from "../../core/tile-scheduling-policy";
import {
  initialMeshLoadError,
  isExtentFloorTile,
} from "./three-tiles-load-policy";
import {
  isPublishedMeshRefinementLevel,
  shouldDeferMeshRefinement,
} from "./three-tiles-mesh-frontier";
import {
  MESH_REFINEMENT_PREFETCH_LEVELS,
  TILE_METADATA_DOWNLOAD_CONCURRENCY,
  TILE_METADATA_PARSE_CONCURRENCY,
} from "./three-tiles-runtime-config";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import type {
  RuntimePriorityQueue,
  RuntimeTile,
} from "./three-tiles-runtime-types";
import {
  tilesNodeQueuePriorityCallback,
  tilesQueuePriorityCallback,
} from "./three-tiles-runtime-vendor";

export function createThreeTilesPayloadQueues(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    | "disposed"
    | "displayedMeshFrontier"
    | "effectiveErrorTarget"
    | "extentFloorArmed"
    | "extentGeometricError"
    | "map"
    | "memoryErrorTarget"
    | "meshBaseCoverageReady"
    | "meshCoverageRecovery"
    | "meshRefinementSupport"
    | "options"
    | "requestedErrorTarget"
    | "shadowView"
    | "tiles"
  >,
  dependencies: Pick<
    ThreeTilesRuntimeServices,
    | "getTileDebugProgress"
    | "getTileRequestPriority"
    | "getTileScreenError"
    | "isTileNeededForMeshCoverage"
  > & {
    getRetainedMeshAncestors: () => ReadonlySet<Tile>;
    isTileRequestNeeded: (tile: Tile) => boolean;
    noteTileActivity: (tile: Tile) => void;
  }
) {
  const guardedPayloadQueues = new WeakSet<PriorityQueue>();
  let parseWakeTimer: ReturnType<typeof setTimeout> | null = null;
  let metadataWakeTimer: ReturnType<typeof setTimeout> | null = null;
  const metadataDownloads = new DownloadPriorityQueue();
  metadataDownloads.maxJobsPerOrigin = TILE_METADATA_DOWNLOAD_CONCURRENCY;
  metadataDownloads.priorityCallback = tilesQueuePriorityCallback;
  const metadataParsing = new PriorityQueue();
  metadataParsing.maxJobs = TILE_METADATA_PARSE_CONCURRENCY;
  metadataParsing.priorityCallback = tilesNodeQueuePriorityCallback;
  metadataParsing.scheduleJobRun = () => {
    if (metadataWakeTimer !== null || runtimeState.disposed) return;
    metadataWakeTimer = setTimeout(() => {
      metadataWakeTimer = null;
      if (!runtimeState.disposed) metadataParsing.tryRunJobs();
    }, 0);
  };

  const guardPayloadQueue = (nativeQueue: PriorityQueue) => {
    if (guardedPayloadQueues.has(nativeQueue)) return;
    guardedPayloadQueues.add(nativeQueue);
    const queue = nativeQueue as RuntimePriorityQueue;
    const run = queue.tryRunJobs.bind(queue);
    queue.tryRunJobs = () => {
      if (runtimeState.disposed || !runtimeState.tiles) return;
      if (!runtimeState.options.providesTerrain) return run();
      const moving = runtimeState.map?.isMoving?.() === true;
      // Both strategies admit bounded initial-quality work while moving;
      // foreground rank orders jobs without a cross-stage parsing barrier.
      // Native PriorityQueue has no eligibility predicate. Partition only its
      // scheduling list synchronously; promises, callbacks and native abort
      // ownership stay registered. Restore parked entries before yielding.
      // Decision: DRAG-RESIDENT-SIBLINGS-20260916 in TILES_COVERAGE.md.
      const parked: Tile[] = [];
      const ready: Tile[] = [];
      const retainedMeshAncestors = dependencies.getRetainedMeshAncestors();
      // Decision: VIEWPORT-WORK-FIRST-20260914 in TILES_COVERAGE.md.
      // Floor residency is not permission to occupy foreground slots.
      // Immediate family support is foreground coverage, not idle refinement.
      // Keep pending payloads (including downloaded buffers) on their original
      // promises, but start them only after current-camera work drains at rest.
      const currentDemand = new Map<Tile, number>();
      const requestPriority = (tile: Tile) => {
        if (!currentDemand.has(tile)) {
          const candidate = tile as RuntimeTile;
          candidate.cameraPriority =
            dependencies.getTileRequestPriority(candidate);
          currentDemand.set(tile, candidate.cameraPriority);
        }
        return currentDemand.get(tile)!;
      };
      const isForeground = (tile: Tile) =>
        Number.isFinite(requestPriority(tile));
      const foregroundEligibility = new Map<Tile, boolean>();
      const canStartForeground = (tile: Tile) => {
        if (foregroundEligibility.has(tile))
          return foregroundEligibility.get(tile)!;
        if (!isForeground(tile) || !dependencies.isTileRequestNeeded(tile)) {
          foregroundEligibility.set(tile, false);
          return false;
        }
        // Recovery parks only downloads: useful decoded work can finish while
        // the network fills holes, without a cross-stage CPU barrier.
        if (
          runtimeState.meshCoverageRecovery &&
          nativeQueue !== runtimeState.tiles.parseQueue &&
          !dependencies.isTileNeededForMeshCoverage(tile)
        ) {
          foregroundEligibility.set(tile, false);
          return false;
        }
        const runtimeTile = tile as RuntimeTile;
        if (
          runtimeState.meshCoverageRecovery &&
          dependencies.isTileNeededForMeshCoverage(tile)
        ) {
          foregroundEligibility.set(tile, true);
          return true;
        }
        if (runtimeTile.motionPrefetch && requestPriority(tile) < 0) {
          const eligible = runtimeState.meshBaseCoverageReady;
          foregroundEligibility.set(tile, eligible);
          return eligible;
        }
        const floorTile =
          runtimeState.extentFloorArmed &&
          isExtentFloorTile(tile, runtimeState.extentGeometricError);
        const refinementLookahead =
          !runtimeState.shadowView &&
          !moving &&
          isPublishedMeshRefinementLevel(
            tile,
            runtimeState.displayedMeshFrontier,
            2,
            1 + MESH_REFINEMENT_PREFETCH_LEVELS
          );
        const refinementDeferred = shouldDeferMeshRefinement(
          tile,
          moving
            ? initialMeshLoadError(
                Math.max(
                  runtimeState.requestedErrorTarget,
                  runtimeState.memoryErrorTarget
                ),
                runtimeState.options.baseErrorTargetPixels
              )
            : Math.max(
                runtimeState.shadowView
                  ? runtimeState.requestedErrorTarget
                  : runtimeState.effectiveErrorTarget,
                runtimeState.memoryErrorTarget
              ),
          (parent) => dependencies.getTileScreenError(parent as RuntimeTile),
          retainedMeshAncestors,
          runtimeState.options.baseErrorTargetPixels,
          runtimeState.tiles.loadAncestors && !refinementLookahead
        );
        const eligible =
          isForeground(tile) &&
          (floorTile ||
            runtimeState.meshRefinementSupport.has(tile) ||
            runtimeTile.zoomPrefetch === true ||
            !refinementDeferred);
        foregroundEligibility.set(tile, eligible);
        return eligible;
      };
      let highestPendingPriority = Number.NEGATIVE_INFINITY;
      for (const tile of new Set([
        ...runtimeState.tiles.loadingTiles,
        ...queue.items,
      ])) {
        if (canStartForeground(tile))
          highestPendingPriority = Math.max(
            highestPendingPriority,
            requestPriority(tile)
          );
      }
      // Removal mutates the native scheduling list, so audit its snapshot.
      for (const tile of [...queue.items]) {
        if (!dependencies.isTileRequestNeeded(tile)) {
          runtimeState.tiles.lruCache.remove(tile);
          continue;
        }
        // Priority orders ready jobs; it must not be a cross-stage barrier.
        // A high-rank download waiting on the network cannot park ready lower-
        // rank foreground parses while CPU slots sit empty (and vice versa).
        const required = isTileQueueEntryRunnable({
          foregroundEligible: canStartForeground(tile),
          priority: requestPriority(tile),
          motionPrefetch: !!(tile as RuntimeTile).motionPrefetch,
          highestPendingPriority,
          moving,
        });
        (required ? ready : parked).push(tile);
      }
      queue.items = ready;
      try {
        run();
      } finally {
        queue.items.push(...parked);
      }
    };
  };

  const install = () => {
    if (!runtimeState.tiles) return;
    const downloadQueue = new DownloadPriorityQueue();
    downloadQueue.priorityCallback = tilesQueuePriorityCallback;
    // Decision: TILE-METADATA-FAST-LANE-20260909 in engines/maplibre/README.md.
    // Preserve upstream ownership/abort handling, but metadata must not wait
    // behind payload downloads or the mesh parse-backlog throttle.
    const addDownload = downloadQueue.add.bind(downloadQueue);
    downloadQueue.add = (url, tile: Tile, callback, signal) => {
      if (tile.internal.hasUnrenderableContent)
        return metadataDownloads.add(url, tile, callback, signal);
      const pending = addDownload(url, tile, callback, signal);
      for (const queue of downloadQueue.originQueues.values())
        guardPayloadQueue(queue);
      return pending;
    };
    const removeDownload = downloadQueue.remove.bind(downloadQueue);
    downloadQueue.remove = (tile) => {
      metadataDownloads.remove(tile);
      removeDownload(tile);
    };
    const hasDownload = downloadQueue.has.bind(downloadQueue);
    downloadQueue.has = (tile) =>
      metadataDownloads.has(tile) || hasDownload(tile);
    const parseQueue = new PriorityQueue();
    parseQueue.priorityCallback = tilesQueuePriorityCallback;
    guardPayloadQueue(parseQueue);
    // Parsing must not wait for an expensive shadow frame to finish before the
    // next two jobs start. Coalesce native wakeups onto a separate browser task;
    // keep bounded concurrency and yield between batches instead of microtasks.
    parseQueue.scheduleJobRun = () => {
      if (parseWakeTimer !== null || runtimeState.disposed) return;
      parseWakeTimer = setTimeout(() => {
        parseWakeTimer = null;
        if (!runtimeState.disposed) parseQueue.tryRunJobs();
      }, 0);
    };
    const processNodeQueue = new PriorityQueue();
    processNodeQueue.priorityCallback = tilesNodeQueuePriorityCallback;
    runtimeState.tiles.downloadQueue = downloadQueue;
    runtimeState.tiles.parseQueue = parseQueue;
    runtimeState.tiles.processNodeQueue = processNodeQueue;
    const addParseJob = parseQueue.add.bind(parseQueue);
    const removeParseJob = parseQueue.remove.bind(parseQueue);
    parseQueue.remove = (tile) => {
      metadataParsing.remove(tile);
      removeParseJob(tile);
    };
    const hasParseJob = parseQueue.has.bind(parseQueue);
    parseQueue.has = (tile) => metadataParsing.has(tile) || hasParseJob(tile);
    parseQueue.add = (tile: Tile, callback) => {
      const progress = dependencies.getTileDebugProgress(tile);
      if (progress) progress.downloadFinishedAt = performance.now();
      dependencies.noteTileActivity(tile);
      const add = tile.internal.hasUnrenderableContent
        ? metadataParsing.add.bind(metadataParsing)
        : addParseJob;
      return add(tile, async (item) => {
        // Native queue callbacks start in rAF. Yield before metadata/GLTF work
        // so queue admission itself does not run parsing inside a paint callback.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (runtimeState.disposed) return;
        // Decision: VIEWPORT-PREPARSE-PREEMPTION-20260916 in TILES_COVERAGE.md.
        // A new foreground buffer can arrive across the yield. Relinquish the
        // slot before entering non-interruptible GLTF work, even if this tile
        // remains useful to a lower-priority camera or the reserve floor.
        const priority = dependencies.getTileRequestPriority(
          item as RuntimeTile
        );
        const preempted =
          runtimeState.options.providesTerrain &&
          !item.internal.hasUnrenderableContent &&
          (parseQueue as RuntimePriorityQueue).items.some(
            (candidate: RuntimeTile) =>
              dependencies.getTileRequestPriority(candidate) > priority &&
              dependencies.isTileRequestNeeded(candidate)
          );
        if (preempted || !dependencies.isTileRequestNeeded(item)) {
          runtimeState.tiles?.lruCache.remove(item);
          throw new DOMException(
            preempted
              ? "Tile preempted by foreground work"
              : "Obsolete tile request",
            "AbortError"
          );
        }
        if (progress) progress.parseStartedAt = performance.now();
        try {
          return await callback(item);
        } catch (error) {
          if (progress) progress.lastError = String(error).slice(0, 240);
          throw error;
        } finally {
          if (progress) progress.parseFinishedAt = performance.now();
          dependencies.noteTileActivity(tile);
        }
      });
    };
  };

  return {
    install,
    dispose: () => {
      if (parseWakeTimer !== null) clearTimeout(parseWakeTimer);
      parseWakeTimer = null;
      if (metadataWakeTimer !== null) clearTimeout(metadataWakeTimer);
      metadataWakeTimer = null;
    },
    getTelemetry: () => ({
      metadataDownloadsRunning: metadataDownloads.running,
      metadataParsingRunning: metadataParsing.running,
    }),
  };
}
