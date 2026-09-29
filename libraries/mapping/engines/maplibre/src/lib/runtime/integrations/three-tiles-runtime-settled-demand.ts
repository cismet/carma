import { readOrientedTileBounds } from "./three-tiles-bounds";
import { TILE_SHADOW_CAMERA_ID } from "../../core/tile-camera-demand";
import { isExtentFloorTile } from "../../core/mesh-error-policy";
import { isMeshCoveredByLoadedChildren } from "../../core/mesh-tile-coverage";
import {
  MESH_EVICTION_BATCH_SIZE,
  MESH_SETTLED_AUDIT_INTERVAL_MS,
} from "./three-tiles-runtime-config";
import type { ThreeTilesCacheState } from "./three-tiles-runtime-cache";
import type { ThreeTilesRuntimeServices } from "./three-tiles-runtime-context";
import type { RuntimeTile } from "./three-tiles-runtime-types";
import { LOADED_LOADING_STATE } from "./three-tiles-runtime-vendor";

/** Refreshes demand and releases resident mesh detail after motion settles. */
export function createThreeTilesSettledDemand(
  runtimeState: ThreeTilesCacheState,
  dependencies: Pick<
    ThreeTilesRuntimeServices,
    | "getRuntimeCache"
    | "isTileInMainView"
    | "getTileCameraDemand"
    | "assignTilePriority"
    | "maybeEnableShadowSelection"
    | "getTileScreenError"
    | "applyTileDeferral"
    | "requestRender"
    | "resetDeferredTiles"
    | "requestShadowSelectionRefresh"
  >
) {
  // Keep the selected offscreen caster corridor live until it can be displayed.
  const isPendingShadowDemand = (tile: RuntimeTile): boolean =>
    !!runtimeState.shadowView &&
    (runtimeState.shadowCasterRequests.has(tile) ||
      runtimeState.pendingMeshCasterFrontier.has(tile));

  const isRequiredMeshTile: ThreeTilesRuntimeServices["isRequiredMeshTile"] = (
    tile: RuntimeTile
  ): boolean => {
    if (
      runtimeState.meshRefinementSupport.has(tile) ||
      isPendingShadowDemand(tile) ||
      !runtimeState.viewFrustumsReady ||
      dependencies.isTileInMainView(tile) ||
      dependencies.getTileCameraDemand(tile).required
    )
      return true;
    // The idle ring is demand too: evicting it after every move would refetch it.
    if (tile.idleRing === true) return true;
    const bounds = tile.engineData?.boundingVolume;
    // Metadata is tiny and owns descendant topology. Unknown coverage is never
    // proof that deleting a subtree is safe.
    if (tile.internal?.hasUnrenderableContent || !bounds?.getAABB) return true;
    if (
      !runtimeState.shadowView ||
      runtimeState.tileCameraDemand.views.some(
        (view) => view.id === TILE_SHADOW_CAMERA_ID
      )
    )
      return false;
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
      // Decision: TILES_COVERAGE.md#viewport-coverage-recovery.
      // Fresh geometric demand, not upstream ancestor LRU pins, controls release.
      if (
        !runtimeState.tiles ||
        !runtimeState.meshDemandSweepPending ||
        runtimeState.map?.isMoving?.()
      )
        return;
      const cache = dependencies.getRuntimeCache();
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
        dependencies.assignTilePriority(tile);
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
        // Complete replacement families own their off-camera siblings until
        // publication. Reclaiming them here would fight queue admission and
        // repeatedly restart the same payloads while the parent waits.
        if (
          runtimeState.meshRefinementSupport.has(tile) ||
          isPendingShadowDemand(tile as RuntimeTile)
        )
          continue;
        const underPressure =
          runtimeState.memoryAdmissionPaused || cache.isFull();
        if (!underPressure && runtimeState.retainedShadowRequests.has(tile))
          continue;
        // Skip strategy: memory is bounded by the LRU's retention floor and
        // its priority order (far and coarse first), so below the ceiling
        // every loaded tile stays: the rings, and any finer detail a view
        // had, which a pan back or a zoom-out then shows at once.
        // Keep admission headroom while the live view is still refining.
        // Only obsolete demand is released here; the pressure-only replacement
        // rules below remain disabled until the physical ceiling is reached.
        const reclaimForView =
          (!(
            runtimeState.lastActiveViewsConverged ??
            runtimeState.lastMainViewConverged
          ) ||
            runtimeState.memoryErrorTarget >
              runtimeState.requestedErrorTarget) &&
          cache.cachedBytes > cache.minBytesSize;
        if (
          !runtimeState.tiles.loadAncestors &&
          !underPressure &&
          !reclaimForView
        )
          break;
        // A floor tile replaced by its children is still the extent's
        // coverage the next zoom-out shows; never a candidate.
        const replacedParent =
          underPressure &&
          !runtimeState.tiles.activeTiles.has(tile) &&
          !isExtentFloorTile(tile, runtimeState.extentGeometricError) &&
          isMeshCoveredByLoadedChildren(tile, runtimeState.tiles.visibleTiles);
        // Live publication owns its lifetime. Memory pressure may reclaim
        // hidden ancestors or stale work, never force a lower-quality handoff.
        if (
          tile.internal?.loadingState === LOADED_LOADING_STATE &&
          (runtimeState.committedMeshCasterFrontier.has(tile) ||
            ((runtimeState.displayedMeshFrontier.has(tile) ||
              runtimeState.tiles.visibleTiles.has(tile)) &&
              (dependencies.isTileInMainView(tile as RuntimeTile) ||
                dependencies.getTileCameraDemand(tile as RuntimeTile)
                  .required)))
        )
          continue;
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
          dependencies.applyTileDeferral(tile, false);
        }
      }
      if (removed > 0 || runtimeState.meshDemandSweepPending) {
        runtimeState.tiles.dispatchEvent({ type: "needs-update" });
        dependencies.requestRender();
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
        (runtimeState.lastActiveViewsConverged ??
          runtimeState.lastMainViewConverged) &&
        runtimeState.memoryErrorTarget <= runtimeState.requestedErrorTarget &&
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
        dependencies.resetDeferredTiles();
        dependencies.requestShadowSelectionRefresh();
        runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
        dependencies.requestRender();
      }, MESH_SETTLED_AUDIT_INTERVAL_MS);
    };

  return {
    isRequiredMeshTile,
    sweepSettledMeshDemand,
    scheduleSettledMeshAudit,
  };
}
