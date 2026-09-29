import type { Tile } from "3d-tiles-renderer/core";
import { Box3, Matrix4 } from "three";

import type { ShadowReceiverMatch } from "../../core/shadow-receiver-mask";
import type { SharedThreeSceneRuntime } from "../../core/shared-three-scene-types";
import {
  createTileCameraDemand,
  TILE_SHADOW_CAMERA_ID,
} from "../../core/tile-camera-demand";
import {
  compareTileRequestOrder,
  decideTileRequestAction,
  resolveTileRequestAdmission,
  TILE_QUEUE_REASON,
  TILE_QUEUE_STAGE,
  TILE_REQUEST_ACTION,
} from "../../core/tile-scheduling-policy";
import { readOrientedTileBounds } from "./three-tiles-bounds";

import { meshTileAncestors } from "../../core/mesh-tile-coverage";
import { TILES_LOAD_POLICY } from "../../core/tile-load-config";
import {
  isTileCoveragePrerequisite,
  resolveTileRequestNeed,
  TILE_REQUEST_NEED,
} from "../../core/tile-request-need";
import { createThreeTilesMotionPrefetch } from "./three-tiles-motion-prefetch";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import type {
  RuntimeLruCache,
  RuntimePriorityQueue,
  RuntimeTile,
} from "./three-tiles-runtime-types";
import {
  LOADED_LOADING_STATE,
  LOADING_LOADING_STATE,
  PARSING_LOADING_STATE,
  QUEUED_LOADING_STATE,
  UNLOADED_LOADING_STATE,
} from "./three-tiles-runtime-vendor";

/**
 * Skip-strategy loading stages around camera motion: back to the coarse
 * base pass on every move, stale downloads dropped on every motion beat,
 * and the idle ring cascade refined while memory and frame time allow.
 */
export function createThreeTilesCascade(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    | "options"
    | "memoryAdmissionPaused"
    | "loadingPaused"
    | "runtimeVisible"
    | "deferred"
    | "tiles"
    | "map"
    | "meshBaseCoverageReady"
    | "lastMainViewConverged"
    | "lastActiveViewsConverged"
    | "tileCameraDemand"
    | "meshCoverageRecovery"
    | "meshRefinementSupport"
    | "residentAncestors"
    | "effectiveErrorTarget"
    | "requestedErrorTarget"
    | "memoryErrorTarget"
    | "shadowView"
    | "retainedShadowRequests"
    | "shadowCasterRequests"
    | "shadowReceiverMask"
    | "pendingMeshReceiverFrontier"
    | "shadowSelectionEnabled"
    | "ringRefinePasses"
    | "lastRingRefineAt"
    | "lastTraversalMs"
    | "extentGeometricError"
    | "extentFloorArmed"
    | "extentFloorPending"
  >,
  dependencies: Pick<
    ThreeTilesRuntimeServices,
    | "applyEffectiveErrorTarget"
    | "initialEffectiveErrorTarget"
    | "isTileInMainView"
    | "getTileScreenError"
    | "getTileCameraDemand"
    | "getTileRequestPriority"
    | "isTileNeededForMeshCoverage"
    | "isTileInPrefetchMargin"
    | "applyTileDeferral"
  > & { getDownloadPreemptionEligibility: () => (tile: Tile) => boolean }
) {
  const motionPrefetch = createThreeTilesMotionPrefetch(
    runtimeState,
    dependencies
  );
  // Cancel against freshly prepared current demand, never the temporary base
  // stage: valid finer requests must survive zoom reversals. Floor, replacement
  // support and other cameras retain their work. Native removal aborts fetch
  // and pending/active parsing, restoring UNLOADED for a future request.
  const casterBounds = new Box3();
  const casterTransform = new Matrix4();
  const casterMatch: ShadowReceiverMatch = {
    receiverGeometricError: 0,
    receiverCenterness: 0,
    lightFacing: 0,
  };
  const getShadowReceiverError = (tile: Tile): number | null => {
    const bounds = (tile as RuntimeTile).engineData?.boundingVolume;
    if (!bounds?.getAABB || !runtimeState.shadowReceiverMask) return null;
    readOrientedTileBounds(bounds, casterBounds, casterTransform);
    return runtimeState.shadowReceiverMask.match(
      casterBounds,
      casterMatch,
      casterTransform,
      { key: tile, parent: tile.parent ?? undefined }
    )
      ? casterMatch.receiverGeometricError
      : null;
  };
  let pendingReceiverCut: ReadonlySet<Tile> | null | undefined;
  const receiverReplacementAncestors = new Set<Tile>();
  const getTileRequestNeed = (tile: Tile) => {
    if (runtimeState.shadowView && runtimeState.shadowCasterRequests.has(tile))
      return TILE_REQUEST_NEED.SHADOW;
    if (pendingReceiverCut !== runtimeState.pendingMeshReceiverFrontier) {
      pendingReceiverCut = runtimeState.pendingMeshReceiverFrontier;
      receiverReplacementAncestors.clear();
      for (const receiver of pendingReceiverCut ?? [])
        for (const parent of meshTileAncestors(receiver))
          receiverReplacementAncestors.add(parent);
    }
    const runtimeTile = tile as RuntimeTile;
    return resolveTileRequestNeed(tile, {
      coverageRecovery: runtimeState.meshCoverageRecovery,
      extentFloorArmed: runtimeState.extentFloorArmed,
      extentGeometricError: runtimeState.extentGeometricError,
      motionPrefetch: runtimeTile.motionPrefetch === true,
      zoomPrefetch: runtimeTile.zoomPrefetch === true,
      zooming: runtimeState.map?.isZooming?.() === true,
      moving: runtimeState.map?.isMoving?.() === true,
      providesTerrain: runtimeState.options.providesTerrain === true,
      baseCoverageReady: runtimeState.meshBaseCoverageReady,
      mainViewConverged: runtimeState.lastMainViewConverged,
      activeViewsConverged: runtimeState.lastActiveViewsConverged,
      effectiveErrorTarget: runtimeState.effectiveErrorTarget,
      requestedErrorTarget: runtimeState.requestedErrorTarget,
      memoryErrorTarget: runtimeState.memoryErrorTarget,
      idleRing: runtimeTile.idleRing === true,
      shadowSelection: runtimeState.shadowSelectionEnabled,
      shadowView: !!runtimeState.shadowView,
      shadowCameraDemand:
        runtimeState.options.providesTerrain ||
        runtimeState.tileCameraDemand.views.some(
          (view) => view.id === TILE_SHADOW_CAMERA_ID
        ),
      retainedShadowRequest:
        !!runtimeState.shadowView &&
        !runtimeState.memoryAdmissionPaused &&
        runtimeState.map?.isMoving?.() !== true &&
        runtimeState.retainedShadowRequests.has(tile),
      refinementSupport: runtimeState.meshRefinementSupport,
      receiverReplacementAncestors,
      residentAncestors: runtimeState.residentAncestors,
      visibleTiles: runtimeState.tiles?.visibleTiles ?? new Set(),
      coverageNeeded: dependencies.isTileNeededForMeshCoverage,
      motionNeeded: motionPrefetch.needed,
      inMainView: dependencies.isTileInMainView,
      inPrefetchMargin: dependencies.isTileInPrefetchMargin,
      screenError: dependencies.getTileScreenError,
      cameraDemand: (tile) =>
        dependencies.getTileCameraDemand(tile as RuntimeTile, true),
      shadowReceiverError: getShadowReceiverError,
    });
  };
  const isTileRequestNeeded = (tile: Tile) => getTileRequestNeed(tile) !== null;
  const abortStaleDownloads = () => {
    const tiles = runtimeState.tiles;
    if (!tiles) return;
    for (const tile of runtimeState.retainedShadowRequests) {
      if (
        !tiles.loadingTiles.has(tile) ||
        runtimeState.memoryAdmissionPaused ||
        runtimeState.map?.isMoving?.() === true
      )
        runtimeState.retainedShadowRequests.delete(tile);
    }
    const pending = [...tiles.loadingTiles] as RuntimeTile[];
    const canStartDownload = runtimeState.options.providesTerrain
      ? dependencies.getDownloadPreemptionEligibility()
      : null;
    // Preempt only active background fetches for actual waiting view payloads.
    // Downloaded buffers stay parked in the parse queue; already running decode
    // jobs finish within the bounded parse concurrency, not repeated restarts.
    const foregroundWaiting = runtimeState.options.providesTerrain
      ? pending.filter(
          (tile) =>
            tile.internal.loadingState === QUEUED_LOADING_STATE &&
            tile.internal.hasRenderableContent &&
            canStartDownload?.(tile) &&
            Number.isFinite(dependencies.getTileRequestPriority(tile)) &&
            resolveTileRequestAdmission({
              needed: isTileRequestNeeded(tile),
              coveragePrerequisite: isTileCoveragePrerequisite(
                getTileRequestNeed(tile),
                Boolean(
                  runtimeState.shadowView &&
                    runtimeState.pendingMeshReceiverFrontier?.size
                )
              ),
              coverageRecovery: runtimeState.meshCoverageRecovery,
              coverageFill:
                runtimeState.meshCoverageRecovery &&
                dependencies.isTileNeededForMeshCoverage(tile),
              stage: TILE_QUEUE_STAGE.DOWNLOAD,
            }) === TILE_QUEUE_REASON.CURRENT_DEMAND
        )
      : [];
    const selectedPreemptions = new Set<RuntimeTile>();
    // Each origin has one order for this demand snapshot. Reusing it avoids
    // filtering and sorting the same backlog for every active download.
    const waitingByQueue = new Map<RuntimePriorityQueue, RuntimeTile[]>();
    const nextWaiting = (queue: RuntimePriorityQueue) => {
      let ordered = waitingByQueue.get(queue);
      if (!ordered) {
        const queued = new Set(queue.items);
        ordered = foregroundWaiting
          .filter((candidate) => queued.has(candidate))
          .sort((left, right) =>
            compareTileRequestOrder(
              dependencies.getTileRequestPriority(right),
              dependencies.getTileRequestPriority(left),
              right.meshRefinement?.benefit,
              left.meshRefinement?.benefit,
              right.meshRefinement?.currentErrorPixels,
              left.meshRefinement?.currentErrorPixels,
              right.meshRefinement?.errorBand,
              left.meshRefinement?.errorBand
            )
          );
        waitingByQueue.set(queue, ordered);
      }
      return ordered.find((candidate) => !selectedPreemptions.has(candidate));
    };
    for (const tile of pending) {
      if (
        tile.internal.loadingState !== LOADING_LOADING_STATE &&
        tile.internal.loadingState !== QUEUED_LOADING_STATE &&
        tile.internal.loadingState !== PARSING_LOADING_STATE
      )
        continue;
      const reason = getTileRequestNeed(tile);
      const needed = reason !== null;
      const downloading = tile.internal.loadingState === LOADING_LOADING_STATE;
      const metadata = tile.internal.hasUnrenderableContent;
      const queue =
        needed &&
        !runtimeState.retainedShadowRequests.has(tile) &&
        // Current caster prerequisites must finish before their receiver can
        // publish. Ranking changes between families cannot restart that work.
        reason !== TILE_REQUEST_NEED.SHADOW &&
        downloading &&
        !metadata
          ? (
              tiles.downloadQueue as unknown as {
                // Native has() only sees pending callbacks. This ownership map
                // survives dequeue and keeps running jobs on their exact origin.
                _itemQueues: WeakMap<Tile, RuntimePriorityQueue>;
              }
            )._itemQueues.get(tile)
          : undefined;
      const waiting = queue ? nextWaiting(queue) : undefined;
      const saturated =
        queue !== undefined &&
        tiles.downloadQueue.maxJobsPerOrigin > 0 &&
        queue.currJobs >= tiles.downloadQueue.maxJobsPerOrigin;
      const highestWaitingPriority =
        saturated && waiting !== undefined
          ? dependencies.getTileRequestPriority(waiting)
          : undefined;
      const priority =
        needed &&
        downloading &&
        !metadata &&
        highestWaitingPriority !== undefined
          ? dependencies.getTileRequestPriority(tile)
          : Number.NEGATIVE_INFINITY;
      const action = decideTileRequestAction({
        needed,
        downloading,
        metadata,
        highestWaitingPriority,
        priority,
        benefit: tile.meshRefinement?.benefit,
        highestWaitingBenefit: waiting?.meshRefinement?.benefit,
        currentErrorPixels: tile.meshRefinement?.currentErrorPixels,
        highestWaitingCurrentErrorPixels:
          waiting?.meshRefinement?.currentErrorPixels,
        errorBand: tile.meshRefinement?.errorBand,
        highestWaitingErrorBand: waiting?.meshRefinement?.errorBand,
        // A replacement family needs every demanded sibling. Do not preempt
        // its own pending members while waiting to publish the complete cut.
        sameRefinementGroup:
          tile.meshRefinement !== undefined &&
          tile.meshRefinement.group === waiting?.meshRefinement?.group,
      });
      if (action !== TILE_REQUEST_ACTION.KEEP) tiles.lruCache.remove(tile);
      if (action === TILE_REQUEST_ACTION.PREEMPT) {
        if (waiting) selectedPreemptions.add(waiting);
      }
    }
  };

  // Decision: ZOOM-PREFETCH-20260913 in README.md. Existing vendor queues,
  // cancellation and payload pool; a small bounded walk, never another loader.
  const prefetchZoom: NonNullable<
    SharedThreeSceneRuntime["prefetchZoom"]
  > = async (request, signal) => {
    const tiles = runtimeState.tiles;
    if (!tiles?.root || signal.aborted) return;
    const demand = createTileCameraDemand([request.camera]);
    const bounds = new Box3();
    const pending: { tile: RuntimeTile; remaining: number | null }[] = [
      { tile: tiles.root as RuntimeTile, remaining: null },
    ];
    let admitted = 0;
    let visited = 0;
    while (pending.length && !signal.aborted && runtimeState.tiles === tiles) {
      // Foreground/caster work and memory admission always win. Only one
      // optional payload is outstanding, bounded to 16 requests per gesture.
      const cache = tiles.lruCache as RuntimeLruCache;
      if (
        admitted >= 16 ||
        cache.cachedBytes >= cache.minBytesSize * 0.8 ||
        tiles.stats.queued + tiles.stats.downloading + tiles.stats.parsing >
          0 ||
        tiles.downloadQueue.maxJobsPerOrigin === 0 ||
        tiles.parseQueue.maxJobs === 0
      )
        break;
      if (++visited % 32 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        // Foreground demand or memory pressure may have changed while yielded.
        // Re-enter admission before removing the next node from the work list.
        continue;
      }
      const item = pending.shift()!;
      const tile = item.tile;
      if (!tile.internal || !tile.engineData?.boundingVolume) continue;
      tile.engineData.boundingVolume.getAABB(bounds);
      bounds.applyMatrix4(tiles.group.matrixWorld);
      if (!demand.evaluate(bounds, 0).required) continue;
      const payload =
        tile.internal.hasContent && !tile.internal.hasUnrenderableContent;
      let remaining = item.remaining;
      if (
        remaining === null &&
        payload &&
        dependencies.getTileScreenError(tile) <=
          runtimeState.requestedErrorTarget
      )
        remaining = request.levels;
      else if (remaining !== null && payload) remaining -= 1;
      if (remaining !== null && remaining < 0) continue;
      if (
        tile.internal.hasContent &&
        tile.internal.loadingState === UNLOADED_LOADING_STATE
      ) {
        // Normal target tiles belong to foreground traversal, not speculation.
        if (item.remaining === null && !tile.internal.hasUnrenderableContent)
          continue;
        const adopted = () =>
          dependencies.getTileCameraDemand(tile).required ||
          tile.shadowReceiverCurrent === true ||
          (dependencies.isTileInMainView(tile) &&
            tile.parent &&
            dependencies.getTileScreenError(tile.parent as RuntimeTile) >
              runtimeState.effectiveErrorTarget);
        const abort = () => {
          if (tile.internal.loadingState !== LOADED_LOADING_STATE && !adopted())
            tiles.lruCache.remove(tile);
        };
        tile.zoomPrefetch = true;
        tile.priority = -1;
        signal.addEventListener("abort", abort, { once: true });
        try {
          signal.throwIfAborted();
          admitted += 1;
          const work = tiles.requestTileContents(tile);
          tiles.markTileUsed(tile);
          runtimeState.map?.triggerRepaint();
          await work;
        } finally {
          signal.removeEventListener("abort", abort);
          tile.zoomPrefetch = false;
        }
        if (
          signal.aborted ||
          (tile.internal.loadingState as number) !== LOADED_LOADING_STATE
        )
          break;
      }
      if (remaining === 0 && payload) continue;
      // Respect native metadata processing limits; later gestures can revisit
      // undiscovered children rather than synchronously expanding the full tree.
      tiles.ensureChildrenArePreprocessed(tile, false);
      for (const child of tile.children ?? []) {
        if (child.internal)
          pending.push({ tile: child as RuntimeTile, remaining });
      }
    }
  };
  // Skip strategy (no ancestor fallback): a camera move returns the loader to
  // its base stage, so newly exposed areas fill at the coarse level first and
  // refine once that cut is proven, the way Cesium's progressive-resolution
  // pass reloads after every move. The ancestor strategy keeps its stage.
  const returnToBaseStage = () => {
    if (
      !runtimeState.options.providesTerrain ||
      !runtimeState.tiles ||
      runtimeState.tiles.loadAncestors
    )
      return;
    runtimeState.meshBaseCoverageReady = false;
    // A move restarts the cascade from its coarse levels: the new view's
    // inner rings come first, refinement of the outer ones resumes at rest.
    runtimeState.ringRefinePasses = 0;
    dependencies.applyEffectiveErrorTarget(
      dependencies.initialEffectiveErrorTarget()
    );
    // Cancellation runs in the next prepared view, never against the previous
    // camera's pixel error from a MapLibre movement event.
  };

  // With every ring loaded, the queues idle, memory within the ring budget
  // and traversals cheap, admit the next finer level of the cascade.
  const refineRingCascade = () => {
    const tiles = runtimeState.tiles;
    if (
      !tiles ||
      tiles.loadAncestors ||
      !runtimeState.meshBaseCoverageReady ||
      !(
        runtimeState.lastActiveViewsConverged ??
        runtimeState.lastMainViewConverged
      ) ||
      runtimeState.extentFloorPending > 0 ||
      runtimeState.memoryErrorTarget > runtimeState.requestedErrorTarget ||
      runtimeState.effectiveErrorTarget !== runtimeState.requestedErrorTarget ||
      runtimeState.map?.isMoving?.() ||
      runtimeState.ringRefinePasses >= TILES_LOAD_POLICY.idleRingRefinePassLimit
    )
      return;
    const { stats } = tiles;
    if (stats.queued > 0 || stats.downloading > 0 || stats.parsing > 0) return;
    const now = performance.now();
    if (
      now - runtimeState.lastRingRefineAt <
      TILES_LOAD_POLICY.idleRingRefineIntervalMs
    )
      return;
    const cache = tiles.lruCache as RuntimeLruCache;
    if (
      cache.cachedBytes >=
        cache.minBytesSize * TILES_LOAD_POLICY.idleRingBudgetFraction ||
      runtimeState.lastTraversalMs >
        TILES_LOAD_POLICY.idleRingRefineTraversalBudgetMs
    )
      return;
    runtimeState.lastRingRefineAt = now;
    runtimeState.ringRefinePasses += 1;
    tiles.dispatchEvent({ type: "needs-update" });
  };

  // At rest the renderer traverses only on events; once the queues drain
  // nothing would visit the outer rings or advance the cascade. A slow tick
  // keeps traversing while there is a level left to refine.
  let tickTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleCascadeTick = () => {
    const tiles = runtimeState.tiles;
    if (
      tickTimer !== null ||
      !tiles ||
      tiles.loadAncestors ||
      runtimeState.map?.isMoving?.() ||
      !runtimeState.meshBaseCoverageReady ||
      !(
        runtimeState.lastActiveViewsConverged ??
        runtimeState.lastMainViewConverged
      ) ||
      runtimeState.extentFloorPending > 0 ||
      runtimeState.memoryErrorTarget > runtimeState.requestedErrorTarget ||
      runtimeState.effectiveErrorTarget !== runtimeState.requestedErrorTarget ||
      (tiles.lruCache as RuntimeLruCache).cachedBytes >=
        tiles.lruCache.minBytesSize *
          TILES_LOAD_POLICY.idleRingBudgetFraction ||
      runtimeState.ringRefinePasses >= TILES_LOAD_POLICY.idleRingRefinePassLimit
    )
      return;
    tickTimer = setTimeout(() => {
      tickTimer = null;
      runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
    }, TILES_LOAD_POLICY.idleRingRefineIntervalMs);
  };
  const clearCascadeTick = () => {
    if (tickTimer !== null) clearTimeout(tickTimer);
    tickTimer = null;
  };

  return {
    motionPrefetch,
    prefetchZoom,
    returnToBaseStage,
    abortStaleDownloads,
    isTileRequestNeeded,
    getTileRequestNeed,
    refineRingCascade,
    scheduleCascadeTick,
    clearCascadeTick,
  };
}
