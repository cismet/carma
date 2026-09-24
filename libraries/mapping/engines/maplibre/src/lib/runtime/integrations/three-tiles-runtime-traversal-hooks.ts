import { applyShadowReceiverMask } from "../../core/shadow-receiver-mask";
import {
  resolveTileRequestAdmission,
  TILE_QUEUE_REASON,
  TILE_QUEUE_STAGE,
} from "../../core/tile-scheduling-policy";
import { readOrientedTileBounds } from "./three-tiles-bounds";
import {
  idleRingAllowedError,
  initialMeshLoadError,
  isExtentFloorTile,
} from "../../core/mesh-error-policy";
import { TILES_LOAD_POLICY } from "../../core/tile-load-config";
import { isMeshCoveredByLoadedChildren } from "../../core/mesh-tile-coverage";
import {
  isPublishedMeshRefinementLevel,
  shouldDeferMeshRefinement,
} from "../../core/mesh-tile-refinement";
import { MESH_REFINEMENT_PREFETCH_LEVELS } from "./three-tiles-runtime-config";
import type {
  ThreeTilesRuntimeAttachmentDependencies,
  ThreeTilesRuntimeAttachmentState,
} from "./three-tiles-runtime-attachment";
import type { createThreeTilesPayloadQueues } from "./three-tiles-runtime-payload-queues";
import type { RuntimeLruCache, RuntimeTile } from "./three-tiles-runtime-types";
import {
  LOADED_LOADING_STATE,
  resolveTileContentUrl,
  UNLOADED_LOADING_STATE,
} from "./three-tiles-runtime-vendor";

/** Installs admission and native traversal hooks on the renderer. */
export function installThreeTilesTraversalHooks(
  runtimeState: ThreeTilesRuntimeAttachmentState,
  dependencies: ThreeTilesRuntimeAttachmentDependencies,
  payloadQueues: ReturnType<typeof createThreeTilesPayloadQueues>
): void {
  if (!runtimeState.tiles) return;
  const calculateBytesUsed = runtimeState.tiles.calculateBytesUsed.bind(
    runtimeState.tiles
  );
  runtimeState.tiles.calculateBytesUsed = (tile, scene) => {
    const measured = calculateBytesUsed(tile, scene);
    if (measured !== null && measured > 0) {
      return Math.round(measured * TILES_LOAD_POLICY.residentOverhead);
    }
    return runtimeState.bytesPredictor.predict({
      url: resolveTileContentUrl(tile),
      geometricError: tile.geometricError,
      isExternalTileset: tile.internal.hasUnrenderableContent,
    });
  };
  // D1: the deferral decision rides on upstream's per-frame view error.
  const calculateTileViewErrorWithPlugin =
    runtimeState.tiles.calculateTileViewErrorWithPlugin.bind(
      runtimeState.tiles
    );
  runtimeState.tiles.calculateTileViewErrorWithPlugin = (tile, target) => {
    if (runtimeState.tileBoundsVisible) dependencies.recordTileIteration(tile);
    calculateTileViewErrorWithPlugin(tile, target);
    if (
      runtimeState.options.providesTerrain &&
      (tile as RuntimeTile).engineData?.boundingVolume?.getAABB
    )
      target.inView &&= dependencies.getTileObserverDemand(
        tile as RuntimeTile
      ).intersects;
    if (
      target.inView &&
      (tile as RuntimeTile).engineData?.boundingVolume?.getAABB &&
      runtimeState.tileCameraDemand.views.length > 0
    ) {
      // Decision: UNIFIED-VISIBLE-SSE-20260916 in TILES_COVERAGE.md.
      // Use the same clipped camera-depth error as publication/retention.
      // Taking max(native, clipped) would keep the invisible near-box bias.
      target.error = dependencies.getTileScreenError(tile as RuntimeTile);
    }
    const retainedMeshAncestors = dependencies.getRetainedMeshAncestors();
    if (target.inView && retainedMeshAncestors.has(tile)) {
      // Native REPLACE traversal must reach the retained mixed-LOD cut and
      // discover missing sibling coverage. This affects admission only;
      // publication/coarsening uses getTileScreenError for the real camera.
      target.error = Math.max(
        target.error,
        runtimeState.effectiveErrorTarget + 1
      );
    }
    const runtimeTile = tile as RuntimeTile;
    // Support is a prerequisite within current demand, never a second
    // source of visibility that can keep an old offscreen sibling alive.
    if (target.inView && runtimeState.meshRefinementSupport.has(tile))
      runtimeState.tiles?.markTileUsed(tile);
    if (runtimeTile.zoomPrefetch) runtimeState.tiles?.markTileUsed(tile);
    runtimeTile.shadowReceiverCenterness = undefined;
    runtimeTile.shadowLightFacing = undefined;
    runtimeTile.shadowReceiverCurrent = undefined;
    if (
      runtimeState.shadowSelectionEnabled &&
      runtimeState.shadowReceiverMask &&
      (!runtimeState.options.providesTerrain ||
        (!runtimeState.mainViewSourceTiles.has(tile) && !target.inView))
    ) {
      const bounds = runtimeTile.engineData?.boundingVolume;
      if (bounds?.getAABB) {
        readOrientedTileBounds(
          bounds,
          runtimeState.tileBoundingBox,
          runtimeState.tileBoundsTransform
        );
        const observerInView = target.inView;
        const observerError = target.error;
        const matchedCurrent = applyShadowReceiverMask(
          runtimeState.shadowReceiverMask,
          runtimeState.tileBoundingBox,
          target,
          runtimeState.shadowReceiverMatch,
          tile.geometricError,
          runtimeState.effectiveErrorTarget,
          runtimeState.tileBoundsTransform,
          { key: tile, parent: tile.parent ?? undefined }
        );
        // A visible LOD2 ancestor can also lead to an offscreen caster.
        // Native camera coverage must not suppress that corridor's demand.
        if (observerInView) {
          target.inView = true;
          target.error = matchedCurrent
            ? Math.max(observerError, target.error)
            : observerError;
        }
        if (matchedCurrent) {
          runtimeTile.shadowReceiverCenterness =
            runtimeState.shadowReceiverMatch.receiverCenterness;
          runtimeTile.shadowLightFacing =
            runtimeState.shadowReceiverMatch.lightFacing;
          runtimeTile.shadowReceiverCurrent = true;
        }
      }
    }
    const cameraDemand = dependencies.getTileCameraDemand(tile as RuntimeTile);
    if (cameraDemand.required) {
      target.error = Math.max(
        target.inView ? target.error : 0,
        cameraDemand.errorRatio * runtimeState.effectiveErrorTarget
      );
      target.inView = true;
    }
    // Idle rings retain bounded coarse coverage around a complete viewport.
    // Current shadow demand keeps its own error; new reserve work starts at
    // rest, while loaded reserve tiles stay pinned through camera movement.
    const skipStrategy =
      runtimeState.options.providesTerrain &&
      runtimeState.tiles?.loadAncestors === false;
    // Decision: MESH-COVERAGE-20260912 (R3), TILES_COVERAGE.md.
    // Pin the resident extent floor; reach missing floor payloads before
    // refining their children so fallback coverage always has admission room.
    const extentError = runtimeState.extentGeometricError;
    const floorLevel =
      skipStrategy &&
      runtimeState.extentFloorArmed &&
      isExtentFloorTile(tile, extentError);
    const floorLeaf =
      floorLevel &&
      tile.internal.hasRenderableContent &&
      (tile.children ?? []).every(
        (child) =>
          child.geometricError < extentError ||
          child.internal?.hasRenderableContent === false
      );
    const floorLoaded = tile.internal.loadingState === LOADED_LOADING_STATE;
    // The renderer marks only active leaves used in the LRU; a loaded floor
    // tile the traversal passes through would be an eviction candidate.
    if (floorLevel) runtimeState.tiles!.markTileUsed(tile);
    if (floorLevel && target.inView) {
      runtimeTile.idleRing = false;
      if (floorLeaf && runtimeState.options.diagnostics)
        runtimeState.extentFloorInView.add(tile);
      if (!floorLeaf)
        target.error = Math.max(
          target.error,
          runtimeState.effectiveErrorTarget *
            TILES_LOAD_POLICY.extentFloorAncestorErrorFactor
        );
      else if (!floorLoaded) {
        // Do not spend the cache on children before their replacement
        // coverage arrives. Otherwise an all-used cache cannot admit its
        // missing floor without first punching a hole in the visible cut.
        runtimeState.extentFloorPending += 1;
        dependencies.applyTileDeferral(tile, true);
        runtimeState.tiles!.queueTileForDownload(tile);
        // A reserve parent must not replace already complete finer coverage.
        if (
          tile.internal.hasRenderableContent &&
          !isMeshCoveredByLoadedChildren(
            tile,
            runtimeState.displayedMeshFrontier
          )
        )
          target.error = 0;
      }
    } else if (skipStrategy && !target.inView) {
      const atRest =
        runtimeState.meshBaseCoverageReady &&
        runtimeState.extentFloorArmed &&
        runtimeState.lastMainViewConverged &&
        runtimeState.effectiveErrorTarget ===
          runtimeState.requestedErrorTarget &&
        runtimeState.map?.isMoving?.() !== true;
      if (atRest) {
        const ring = dependencies.getTileRingIndex(runtimeTile);
        runtimeTile.idleRingIndex = ring > 0 ? ring : undefined;
      }
      const ring = runtimeTile.idleRingIndex ?? 0;
      const cache = runtimeState.tiles!.lruCache as RuntimeLruCache;
      const budgetOpen =
        cache.cachedBytes <
        cache.minBytesSize * TILES_LOAD_POLICY.idleRingBudgetFraction;
      const loaded = floorLoaded;
      // Keep loaded reserve coverage, but admit missing offscreen payloads
      // only after visible demand converges. Ancestors still lead traversal
      // to already resident floor leaves while the view changes.
      const wholeModelRing =
        ring > TILES_LOAD_POLICY.idleRingTanMultipliers.length;
      // The budget bounds how far the reserve refines below its coarse floor.
      const admitted =
        (floorLevel && (!floorLeaf || loaded || atRest)) ||
        (ring > 0 && !wholeModelRing && (loaded || atRest));
      runtimeTile.idleRing = admitted;
      if (floorLeaf && !loaded) runtimeState.extentFloorPending += 1;
      if (admitted) {
        target.inView = true;
        if (floorLevel && !floorLeaf) {
          target.error = Math.max(
            target.error,
            runtimeState.effectiveErrorTarget *
              TILES_LOAD_POLICY.extentFloorAncestorErrorFactor
          );
        } else {
          const inRing = ring > 0 && !wholeModelRing;
          const allowed = inRing
            ? idleRingAllowedError(
                initialMeshLoadError(
                  runtimeState.requestedErrorTarget,
                  runtimeState.options.baseErrorTargetPixels
                ),
                ring,
                budgetOpen ? runtimeState.ringRefinePasses : 0,
                runtimeState.requestedErrorTarget
              )
            : 0;
          const satisfied = floorLeaf
            ? !inRing || target.error <= allowed || !atRest || !loaded
            : !atRest || target.error <= allowed;
          if (satisfied)
            target.error = Math.min(
              target.error,
              runtimeState.effectiveErrorTarget
            );
        }
      }
    } else {
      runtimeTile.idleRing = false;
      if (target.inView) runtimeTile.idleRingIndex = undefined;
      if (skipStrategy && runtimeState.residentAncestors.has(tile)) {
        // Resident ancestor band: kept used while a descendant is displayed,
        // requested at rest once the base coverage exists, never a leaf.
        runtimeState.tiles!.markTileUsed(tile);
        if (
          tile.internal.loadingState === UNLOADED_LOADING_STATE &&
          runtimeState.meshBaseCoverageReady &&
          runtimeState.lastMainViewConverged &&
          runtimeState.map?.isMoving?.() !== true
        )
          runtimeState.tiles!.queueTileForDownload(tile);
      }
    }
    if (
      !runtimeState.options.providesTerrain &&
      target.inView &&
      !tile.internal.hasRenderableContent &&
      tile.children.length > 0
    ) {
      // Decision: OFFSCREEN-CASTERS-20260910 in
      // libraries/mapping/shadow-simulation/three/TILED_SHADOW_PAGES.md.
      // An implicit-tileset routing node is not an empty coarse surface.
      // Reach actual content before accepting its SSE; otherwise a loaded
      // offscreen leaf never enters the depth cut and its corridor stalls.
      target.error = Math.max(
        target.error,
        runtimeState.effectiveErrorTarget + 1
      );
    }
    const parent = tile.parent;
    if (
      !runtimeState.options.providesTerrain &&
      target.inView &&
      parent?.refine === "ADD" &&
      !parent.internal.hasRenderableContent &&
      parent.geometricError > 0 &&
      tile.geometricError > 0
    ) {
      // Upstream's ADD shortcut scales the child's SSE to its parent and
      // skips the child even when that parent has no content to draw.
      // Cross that shortcut without forcing the child itself to finer LOD.
      target.error = Math.max(
        target.error,
        ((runtimeState.effectiveErrorTarget + 1) * tile.geometricError) /
          parent.geometricError
      );
    }
    // Decision: ../../../../TILES_COVERAGE.md#bounded-mesh-request-lookahead
    // Ready content publishes independently. At rest, plain meshes
    // discover one further LOD while the immediate family is downloading;
    // JSON routing and payload discovery need not await its presentation.
    if (
      runtimeState.options.providesTerrain &&
      target.inView &&
      (!runtimeState.shadowView ||
        dependencies.isTileInMainView(runtimeTile)) &&
      tile.internal.hasRenderableContent &&
      (runtimeState.displayedMeshFrontier.size === 0 ||
      (runtimeState.meshCoverageRecovery &&
        dependencies.isTileNeededForMeshCoverage(tile))
        ? target.error <=
          (runtimeState.options.firstImageErrorTargetPixels ??
            TILES_LOAD_POLICY.firstImageMaxErrorPixels)
        : isPublishedMeshRefinementLevel(
            tile,
            runtimeState.displayedMeshFrontier,
            !runtimeState.shadowView && !runtimeState.map?.isMoving?.()
              ? 1 + MESH_REFINEMENT_PREFETCH_LEVELS
              : 1
          ))
    )
      target.error = Math.min(target.error, runtimeState.effectiveErrorTarget);
    dependencies.applyTileDeferral(tile, target.inView);
    // Skip traversal normally requests only its terminal payload. Keep the
    // intervening prefetched LODs available too when looking two levels ahead.
    if (
      runtimeState.options.providesTerrain &&
      !runtimeState.shadowView &&
      !runtimeState.map?.isMoving?.() &&
      target.inView &&
      dependencies.isTileInMainView(runtimeTile) &&
      isPublishedMeshRefinementLevel(
        tile,
        runtimeState.displayedMeshFrontier,
        2,
        MESH_REFINEMENT_PREFETCH_LEVELS
      )
    ) {
      runtimeState.tiles!.markTileUsed(tile);
      runtimeState.tiles!.queueTileForDownload(tile);
    }
  };
  const queueTileForDownload = runtimeState.tiles.queueTileForDownload.bind(
    runtimeState.tiles
  );
  runtimeState.tiles.queueTileForDownload = (tile) => {
    const tiles = runtimeState.tiles;
    if (!tiles) return;
    if (runtimeState.memoryAdmissionPaused || runtimeState.loadingPaused)
      return;
    if (
      tile.internal.loadingState !== UNLOADED_LOADING_STATE ||
      runtimeState.queuedThisTraversal.has(tile)
    )
      return;
    const runtimeTile = tile as RuntimeTile;
    const coverageFill =
      runtimeState.meshCoverageRecovery &&
      dependencies.isTileNeededForMeshCoverage(tile);
    if (
      resolveTileRequestAdmission({
        needed: dependencies.isTileRequestNeeded(tile),
        coverageRecovery: runtimeState.meshCoverageRecovery,
        coverageFill,
        stage: TILE_QUEUE_STAGE.DOWNLOAD,
      }) !== TILE_QUEUE_REASON.CURRENT_DEMAND
    )
      return;
    const retainedMeshAncestors = dependencies.getRetainedMeshAncestors();
    const floorTile =
      (runtimeState.extentFloorArmed &&
        isExtentFloorTile(tile, runtimeState.extentGeometricError)) ||
      runtimeState.residentAncestors.has(tile);
    const supportTile = runtimeState.meshRefinementSupport.has(tile);
    const refinementLookahead =
      !runtimeState.shadowView &&
      !runtimeState.map?.isMoving?.() &&
      isPublishedMeshRefinementLevel(
        tile,
        runtimeState.displayedMeshFrontier,
        2,
        1 + MESH_REFINEMENT_PREFETCH_LEVELS
      );
    if (
      runtimeState.options.providesTerrain &&
      !floorTile &&
      !supportTile &&
      !coverageFill &&
      (isMeshCoveredByLoadedChildren(tile, tiles.visibleTiles) ||
        (retainedMeshAncestors.has(tile) &&
          tile.internal.hasRenderableContent &&
          !tile.internal.hasUnrenderableContent))
    )
      return;
    if (
      runtimeState.options.providesTerrain &&
      !floorTile &&
      !supportTile &&
      !coverageFill &&
      !tile.internal.hasUnrenderableContent &&
      dependencies.isTileInMainView(runtimeTile) &&
      shouldDeferMeshRefinement(
        tile,
        runtimeState.map?.isMoving?.()
          ? initialMeshLoadError(
              runtimeState.requestedErrorTarget,
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
      )
    )
      return;
    if (runtimeState.tileRetries.isBlocked(tile)) return;
    // D7: REPLACE content that refines unconditionally is never displayed.
    if (
      tile.refine === "REPLACE" &&
      !floorTile &&
      (tile as RuntimeTile).traversal?.unconditionallyRefine === true &&
      tile.internal.hasRenderableContent
    ) {
      return;
    }
    // Queue only this request's actual camera/corridor demand. Replacement
    // siblings are discovered by traversal, never forced into the queue.
    dependencies.assignTilePriority(runtimeTile);
    runtimeState.queuedThisTraversal.add(tile);
    dependencies.getTileDebugProgress(tile).queuedAt ??= performance.now();
    dependencies.noteTileActivity(tile);
    runtimeTile.firstPublicationRequestedAt = performance.now();
    if (coverageFill) payloadQueues.makeRoomForCoverage(tile);
    queueTileForDownload(tile);
  };
}
