import type { Tile } from "3d-tiles-renderer/core";
import { meshTileAncestors } from "../../core/mesh-tile-coverage";
import {
  TILE_REQUEST_NEED,
  type resolveTileRequestNeed,
} from "../../core/tile-request-need";
import {
  compareTileRequestOrder,
  shouldPreemptTileRequest,
  TILE_QUEUE_ACTION,
  TILE_QUEUE_REASON,
  TILE_QUEUE_STAGE,
} from "../../core/tile-scheduling-policy";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import type { RuntimeTile } from "./three-tiles-runtime-types";
import {
  LOADING_LOADING_STATE,
  QUEUED_LOADING_STATE,
} from "./three-tiles-runtime-vendor";

/** Reclaims native reservations for stronger live demand before cache admission.
 * Published cuts, decoded buffers and the same atomic shadow family stay intact.
 * Decision: ../../../../TILES_COVERAGE.md#queue-admission-and-capacity-recovery
 */
export function makeRoomForThreeTilesRequest(
  state: Pick<
    ThreeTilesRuntimeState,
    | "tiles"
    | "options"
    | "shadowView"
    | "meshCoverageRecovery"
    | "displayedMeshFrontier"
    | "committedMeshReceiverFrontier"
    | "committedMeshCasterFrontier"
  >,
  dependencies: Pick<
    ThreeTilesRuntimeServices,
    | "resetMeshCameraObjectives"
    | "getTileRequestPriority"
    | "isTileNeededForMeshCoverage"
    | "recordTileRequestDecision"
    | "getTileObserverDemand"
  > & {
    getTileRequestNeed: (
      tile: Tile
    ) => ReturnType<typeof resolveTileRequestNeed>;
    isTileRequestNeeded: (tile: Tile) => boolean;
  },
  tile: Tile
) {
  const tiles = state.tiles;
  if (!state.options.providesTerrain || !tiles?.lruCache.isFull()) return;
  // Sun-time changes alone retain useful requests; only actual full-cache
  // pressure permits this reclamation, without changing published coverage.
  // Published cuts can change within the frame. Snapshot the requester and all
  // candidates from the same refreshed objective; stale scores cause churn.
  dependencies.resetMeshCameraObjectives();
  const reason = dependencies.getTileRequestNeed(tile);
  const coverageFill =
    state.meshCoverageRecovery &&
    dependencies.isTileNeededForMeshCoverage(tile);
  if (
    !coverageFill &&
    reason !== TILE_REQUEST_NEED.CAMERA &&
    reason !== TILE_REQUEST_NEED.SHADOW &&
    reason !== TILE_REQUEST_NEED.SUPPORT
  )
    return;
  const structuralGroup = (candidate: Tile) => {
    let nearest: Tile | undefined;
    let published: Tile | undefined;
    for (const ancestor of meshTileAncestors(candidate)) {
      if (!nearest && ancestor.internal.hasRenderableContent)
        nearest = ancestor;
      if (
        state.displayedMeshFrontier.has(ancestor) ||
        state.committedMeshReceiverFrontier.has(ancestor) ||
        state.committedMeshCasterFrontier.has(ancestor)
      )
        published = ancestor;
    }
    return published ?? nearest ?? candidate;
  };
  const score = (candidate: Tile) => {
    const priority = dependencies.getTileRequestPriority(
      candidate as RuntimeTile
    );
    const refinement = (candidate as RuntimeTile).meshRefinement;
    return {
      tile: candidate,
      priority,
      benefit: refinement?.benefit,
      currentErrorPixels: refinement?.currentErrorPixels,
      errorBand: refinement?.errorBand,
      // Incomplete geometry may have no camera objective yet. Its structural
      // replacement family still owns atomic handover while shadows are on.
      group:
        refinement?.group ??
        (state.shadowView ? structuralGroup(candidate) : undefined),
    };
  };
  const requester = score(tile);
  if (!Number.isFinite(requester.priority) || requester.priority < 0) return;
  const candidates = [...tiles.loadingTiles]
    .filter(
      (candidate) =>
        candidate !== tile &&
        (candidate.internal.loadingState === QUEUED_LOADING_STATE ||
          candidate.internal.loadingState === LOADING_LOADING_STATE) &&
        candidate.internal.hasRenderableContent &&
        !candidate.internal.hasUnrenderableContent &&
        !tiles.visibleTiles.has(candidate) &&
        !state.displayedMeshFrontier.has(candidate) &&
        !state.committedMeshReceiverFrontier.has(candidate) &&
        !state.committedMeshCasterFrontier.has(candidate) &&
        // A pending receiver owns these reservations too. Reclaim stale work,
        // not another prerequisite of the cut that releases the old geometry.
        (!state.shadowView ||
          dependencies.getTileRequestNeed(candidate) !==
            TILE_REQUEST_NEED.SHADOW) &&
        !dependencies.isTileNeededForMeshCoverage(candidate)
    )
    .map(score)
    .filter((candidate) =>
      shouldPreemptTileRequest({
        priority: candidate.priority,
        waitingPriority: requester.priority,
        benefit: candidate.benefit,
        waitingBenefit: requester.benefit,
        currentErrorPixels: candidate.currentErrorPixels,
        waitingCurrentErrorPixels: requester.currentErrorPixels,
        errorBand: candidate.errorBand,
        waitingErrorBand: requester.errorBand,
        sameRefinementGroup:
          requester.group !== undefined && candidate.group === requester.group,
      })
    )
    .sort(
      (left, right) =>
        compareTileRequestOrder(
          left.priority,
          right.priority,
          left.benefit,
          right.benefit,
          left.currentErrorPixels,
          right.currentErrorPixels,
          left.errorBand,
          right.errorBand
        ) || left.tile.internal.loadingState - right.tile.internal.loadingState
    );
  for (const { tile: candidate, priority } of candidates) {
    if (!tiles.lruCache.isFull()) break;
    if (!tiles.lruCache.remove(candidate)) continue;
    if (state.options.diagnostics && state.options.tileTelemetry !== false)
      dependencies.recordTileRequestDecision(candidate, {
        action: TILE_QUEUE_ACTION.DISCARD,
        reason: coverageFill
          ? TILE_QUEUE_REASON.COVERAGE_CAPACITY
          : TILE_QUEUE_REASON.REQUEST_CAPACITY,
        stage: TILE_QUEUE_STAGE.DOWNLOAD,
        priority,
        needed: dependencies.isTileRequestNeeded(candidate),
        coverageFill: false,
        inViewport: dependencies.getTileObserverDemand(candidate as RuntimeTile)
          .intersects,
      });
  }
}
