import {
  TILE_REQUEST_NEED,
  type resolveTileRequestNeed,
} from "../../core/tile-request-need";
import {
  DownloadPriorityQueue,
  PriorityQueue,
  type Tile,
} from "3d-tiles-renderer/core";

import {
  resolveTileQueueDecision,
  resolveTileRequestAdmission,
  shouldPreemptTileRequest,
  TILE_QUEUE_ACTION,
  TILE_QUEUE_REASON,
  TILE_QUEUE_STAGE,
} from "../../core/tile-scheduling-policy";
import {
  initialMeshLoadError,
  isExtentFloorTile,
} from "../../core/mesh-error-policy";
import {
  isPublishedMeshRefinementLevel,
  shouldDeferMeshRefinement,
} from "../../core/mesh-tile-refinement";
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
  LOADING_LOADING_STATE,
  QUEUED_LOADING_STATE,
  tilesNodeQueuePriorityCallback,
  tilesQueuePriorityCallback,
} from "./three-tiles-runtime-vendor";

export function createThreeTilesPayloadQueues(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    | "committedMeshCasterFrontier"
    | "committedMeshReceiverFrontier"
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
    | "getTileObserverDemand"
    | "recordTileRequestDecision"
    | "getTileRequestPriority"
    | "getTileScreenError"
    | "isTileNeededForMeshCoverage"
  > & {
    getRetainedMeshAncestors: () => ReadonlySet<Tile>;
    isTileRequestNeeded: (tile: Tile) => boolean;
    getTileRequestNeed: (
      tile: Tile
    ) => ReturnType<typeof resolveTileRequestNeed>;
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
  metadataParsing.priorityCallback = tilesQueuePriorityCallback;
  metadataParsing.scheduleJobRun = () => {
    if (metadataWakeTimer !== null || runtimeState.disposed) return;
    metadataWakeTimer = setTimeout(() => {
      metadataWakeTimer = null;
      if (!runtimeState.disposed) metadataParsing.tryRunJobs();
    }, 0);
  };

  // Queue admission and preemption must agree: parked detail cannot take a
  // slot from useful family work merely because its eventual rank is higher.
  const createQueueEvaluation = (
    stage: (typeof TILE_QUEUE_STAGE)[keyof typeof TILE_QUEUE_STAGE],
    pending: Iterable<Tile>
  ) => {
    const moving = runtimeState.map?.isMoving?.() === true;
    const retainedMeshAncestors = dependencies.getRetainedMeshAncestors();
    // One demand snapshot per scheduling pass; it never outlives this view.
    const currentDemand = new Map<
      Tile,
      {
        priority: number;
        needed: boolean;
        reason: ReturnType<typeof resolveTileRequestNeed>;
        coverageFill: boolean;
        admission: ReturnType<typeof resolveTileRequestAdmission>;
      }
    >();
    const demandFor = (tile: Tile) => {
      let demand = currentDemand.get(tile);
      if (!demand) {
        const priority = dependencies.getTileRequestPriority(
          tile as RuntimeTile
        );
        (tile as RuntimeTile).cameraPriority = priority;
        const reason = dependencies.getTileRequestNeed(tile);
        const needed = reason !== null;
        const coverageFill =
          runtimeState.meshCoverageRecovery &&
          dependencies.isTileNeededForMeshCoverage(tile);
        demand = {
          priority,
          needed,
          reason,
          coverageFill,
          admission: resolveTileRequestAdmission({
            needed,
            coverageFill,
            coverageRecovery: runtimeState.meshCoverageRecovery,
            stage,
          }),
        };
        currentDemand.set(tile, demand);
      }
      return demand;
    };
    const requestPriority = (tile: Tile) => demandFor(tile).priority;
    const foregroundEligibility = new Map<Tile, boolean>();
    const evaluateForeground = (tile: Tile) => {
      const demand = demandFor(tile);
      if (
        demand.admission !== TILE_QUEUE_REASON.CURRENT_DEMAND ||
        !Number.isFinite(demand.priority)
      )
        return false;
      if (demand.coverageFill) return true;
      const runtimeTile = tile as RuntimeTile;
      if (runtimeTile.motionPrefetch && requestPriority(tile) < 0) {
        return runtimeState.meshBaseCoverageReady;
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
      // A tile may be both in the observer and a required caster. Use the
      // owning request reason rather than inferring ownership from location.
      if (
        demand.reason === TILE_REQUEST_NEED.SHADOW ||
        demand.reason === TILE_REQUEST_NEED.CAMERA
      )
        return true;
      // The current-demand policy already decides caster/secondary-camera LOD.
      // An observer-only stop must not park those independent requests forever.
      // Decision: TILES_COVERAGE.md#visible-receiver-corridors.
      const refinementDeferred =
        dependencies.getTileObserverDemand(runtimeTile).intersects &&
        shouldDeferMeshRefinement(
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
          !!runtimeState.tiles?.loadAncestors && !refinementLookahead
        );
      return (
        floorTile ||
        runtimeState.meshRefinementSupport.has(tile) ||
        runtimeTile.zoomPrefetch === true ||
        !refinementDeferred
      );
    };
    const canStartForeground = (tile: Tile) => {
      if (!foregroundEligibility.has(tile))
        foregroundEligibility.set(tile, evaluateForeground(tile));
      return foregroundEligibility.get(tile)!;
    };
    let highestPendingPriority = Number.NEGATIVE_INFINITY;
    for (const tile of pending) {
      if (canStartForeground(tile))
        highestPendingPriority = Math.max(
          highestPendingPriority,
          requestPriority(tile)
        );
    }
    return {
      demandFor,
      decisionFor: (tile: Tile) => {
        const demand = demandFor(tile);
        return resolveTileQueueDecision({
          admission: demand.admission,
          foregroundEligible: canStartForeground(tile),
          priority: demand.priority,
          motionPrefetch: !!(tile as RuntimeTile).motionPrefetch,
          highestPendingPriority,
          moving,
        });
      },
    };
  };

  const guardPayloadQueue = (nativeQueue: PriorityQueue) => {
    if (guardedPayloadQueues.has(nativeQueue)) return;
    guardedPayloadQueues.add(nativeQueue);
    const queue = nativeQueue as RuntimePriorityQueue;
    const run = queue.tryRunJobs.bind(queue);
    queue.tryRunJobs = () => {
      if (runtimeState.disposed || !runtimeState.tiles) return;
      if (!runtimeState.options.providesTerrain) return run();
      // Both strategies admit bounded initial-quality work while moving;
      // foreground rank orders jobs without a cross-stage parsing barrier.
      // Native PriorityQueue has no eligibility predicate. Partition only its
      // scheduling list synchronously; promises, callbacks and native abort
      // ownership stay registered. Restore parked entries before yielding.
      // Decision: DRAG-RESIDENT-SIBLINGS-20260916 in TILES_COVERAGE.md.
      const parked: Tile[] = [];
      const ready: Tile[] = [];
      // Decision: VIEWPORT-WORK-FIRST-20260914 in TILES_COVERAGE.md.
      // Floor residency is not permission to occupy foreground slots.
      // Immediate family support is foreground coverage, not idle refinement.
      // Keep pending payloads (including downloaded buffers) on their original
      // promises, but start them only after current-camera work drains at rest.
      const stage =
        nativeQueue === runtimeState.tiles.parseQueue
          ? TILE_QUEUE_STAGE.PARSE
          : TILE_QUEUE_STAGE.DOWNLOAD;
      const evaluation = createQueueEvaluation(
        stage,
        new Set([...runtimeState.tiles.loadingTiles, ...queue.items])
      );
      // Removal mutates the native scheduling list, so audit its snapshot.
      for (const tile of [...queue.items]) {
        const demand = evaluation.demandFor(tile);
        const decision = evaluation.decisionFor(tile);
        if (
          runtimeState.options.diagnostics &&
          runtimeState.options.tileTelemetry !== false
        )
          dependencies.recordTileRequestDecision(tile, {
            ...decision,
            stage,
            priority: demand.priority,
            needed: demand.needed,
            coverageFill: demand.coverageFill,
            inViewport: dependencies.getTileObserverDemand(tile as RuntimeTile)
              .intersects,
          });
        if (decision.action === TILE_QUEUE_ACTION.DISCARD) {
          runtimeState.tiles.lruCache.remove(tile);
          continue;
        }
        (decision.action === TILE_QUEUE_ACTION.RUN ? ready : parked).push(tile);
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
        const evaluation =
          runtimeState.options.providesTerrain &&
          !item.internal.hasUnrenderableContent
            ? createQueueEvaluation(
                TILE_QUEUE_STAGE.PARSE,
                new Set([
                  ...(runtimeState.tiles?.loadingTiles ?? []),
                  ...(parseQueue as RuntimePriorityQueue).items,
                ])
              )
            : null;
        const preempted =
          evaluation !== null &&
          (parseQueue as RuntimePriorityQueue).items.some(
            (candidate: RuntimeTile) =>
              evaluation.decisionFor(candidate).action ===
                TILE_QUEUE_ACTION.RUN &&
              shouldPreemptTileRequest({
                priority,
                waitingPriority: evaluation.demandFor(candidate).priority,
                benefit: (item as RuntimeTile).meshRefinement?.benefit,
                waitingBenefit: candidate.meshRefinement?.benefit,
                sameRefinementGroup:
                  candidate.meshRefinement !== undefined &&
                  candidate.meshRefinement.group ===
                    (item as RuntimeTile).meshRefinement?.group,
              })
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

  // Decision: ../../../../TILES_COVERAGE.md#queue-admission-and-capacity-recovery
  // A full cache rejects new native queue entries before normal preemption can
  // see them. Release pending background work only for a concrete coverage job.
  const makeRoomForCoverage = (tile: Tile) => {
    const tiles = runtimeState.tiles;
    if (!tiles?.lruCache.isFull()) return;
    const candidates = [...tiles.loadingTiles]
      .filter(
        (candidate) =>
          candidate !== tile &&
          (candidate.internal.loadingState === QUEUED_LOADING_STATE ||
            candidate.internal.loadingState === LOADING_LOADING_STATE) &&
          candidate.internal.hasRenderableContent &&
          !candidate.internal.hasUnrenderableContent &&
          !tiles.visibleTiles.has(candidate) &&
          !runtimeState.displayedMeshFrontier.has(candidate) &&
          !runtimeState.committedMeshReceiverFrontier.has(candidate) &&
          !runtimeState.committedMeshCasterFrontier.has(candidate) &&
          !dependencies.isTileNeededForMeshCoverage(candidate)
      )
      .sort(
        (left, right) =>
          left.internal.loadingState - right.internal.loadingState ||
          dependencies.getTileRequestPriority(left as RuntimeTile) -
            dependencies.getTileRequestPriority(right as RuntimeTile)
      );
    for (const candidate of candidates) {
      if (!tiles.lruCache.isFull()) break;
      if (
        runtimeState.options.diagnostics &&
        runtimeState.options.tileTelemetry !== false
      )
        dependencies.recordTileRequestDecision(candidate, {
          action: TILE_QUEUE_ACTION.DISCARD,
          reason: TILE_QUEUE_REASON.COVERAGE_CAPACITY,
          stage: TILE_QUEUE_STAGE.DOWNLOAD,
          priority: dependencies.getTileRequestPriority(
            candidate as RuntimeTile
          ),
          needed: dependencies.isTileRequestNeeded(candidate),
          coverageFill: false,
          inViewport: dependencies.getTileObserverDemand(
            candidate as RuntimeTile
          ).intersects,
        });
      tiles.lruCache.remove(candidate);
    }
  };

  return {
    install,
    makeRoomForCoverage,
    getDownloadPreemptionEligibility: () => {
      const evaluation = createQueueEvaluation(
        TILE_QUEUE_STAGE.DOWNLOAD,
        runtimeState.tiles?.loadingTiles ?? []
      );
      return (tile: Tile) =>
        evaluation.decisionFor(tile).action === TILE_QUEUE_ACTION.RUN;
    },
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
