import { readOrientedTileBounds } from "./three-tiles-bounds";
import { isExtentFloorTile } from "../../core/mesh-error-policy";
import {
  hasLoadedExtentFloorAncestor,
  isMeshCoveredByLoadedChildren,
} from "../../core/mesh-tile-coverage";
import { shouldDeferMeshRefinement } from "../../core/mesh-tile-refinement";
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
  const isRequiredMeshTile: ThreeTilesRuntimeServices["isRequiredMeshTile"] = (
    tile: RuntimeTile
  ): boolean => {
    if (
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
      runtimeState.tileBoundsTransform,
      { key: tile, parent: tile.parent ?? undefined }
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
        const pending = runtimeState.tiles.loadingTiles.has(tile);
        const underPressure =
          runtimeState.memoryAdmissionPaused || cache.isFull();
        // Skip strategy: memory is bounded by the LRU's retention floor and
        // its priority order (far and coarse first), so below the ceiling
        // every loaded tile stays: the rings, and any finer detail a view
        // had, which a pan back or a zoom-out then shows at once.
        if (!runtimeState.tiles.loadAncestors && !underPressure) break;
        // A floor tile replaced by its children is still the extent's
        // coverage the next zoom-out shows; never a candidate.
        const replacedParent =
          underPressure &&
          !runtimeState.tiles.activeTiles.has(tile) &&
          !isExtentFloorTile(tile, runtimeState.extentGeometricError) &&
          isMeshCoveredByLoadedChildren(tile, runtimeState.tiles.visibleTiles);
        // Skip strategy at the ceiling: a loaded refinement below the current
        // cut whose floor tile is resident can go, the floor keeps the ground
        // covered while the coarser level of the new view is admitted. Without
        // it a cache full of retained fine tiles admits nothing, and the
        // coarser replacement they wait for never arrives.
        // A loaded parent (the resident band or the floor) makes any tile
        // droppable: the parent shows in its place. While floor tiles are
        // still pending at the ceiling, even a displayed tile goes, finest
        // first, so the floor is admitted before the view refines.
        const parentLoaded =
          tile.parent?.internal?.hasRenderableContent === true &&
          tile.parent.internal.loadingState === LOADED_LOADING_STATE;
        const droppableRefinement =
          underPressure &&
          !pending &&
          runtimeState.tiles.loadAncestors === false &&
          tile.internal?.hasRenderableContent === true &&
          tile.internal.loadingState === LOADED_LOADING_STATE &&
          !isExtentFloorTile(tile, runtimeState.extentGeometricError) &&
          (parentLoaded ||
            hasLoadedExtentFloorAncestor(
              tile,
              runtimeState.extentGeometricError
            )) &&
          (runtimeState.extentFloorPending > 0 ||
            shouldDeferMeshRefinement(
              tile,
              runtimeState.effectiveErrorTarget,
              (parent) => dependencies.getTileScreenError(parent as RuntimeTile)
            ));
        // Paused parsing must not retain finer pending blobs behind the stage
        // that is waiting to publish. Release only unnecessary uncommitted work;
        // the complete visible receiver/caster cut remains pinned throughout.
        if (
          !replacedParent &&
          !droppableRefinement &&
          isRequiredMeshTile(tile as RuntimeTile)
        )
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
