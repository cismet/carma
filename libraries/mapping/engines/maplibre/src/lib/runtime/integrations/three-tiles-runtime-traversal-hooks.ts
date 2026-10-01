import type { Tile } from "3d-tiles-renderer/core";
import { applyShadowReceiverMask } from "../../core/shadow-receiver-mask";
import { TILE_SHADOW_CAMERA_ID } from "../../core/tile-camera-demand";
import {
  isTileCoveragePrerequisite,
  TILE_REQUEST_NEED,
} from "../../core/tile-request-need";
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
import { createMeshFamilyCoverage } from "../../core/mesh-family-coverage";
import {
  createMeshRegionCutQuery,
  isLoadedMesh,
  isMeshCoveredByLoadedChildren,
  isMeshTileUnconditionallyRefined,
  meshTileAncestors,
} from "../../core/mesh-tile-coverage";
import { shouldDeferMeshRefinement } from "../../core/mesh-tile-refinement";
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

import { createAffineTilesTraversalPreparation } from "./three-tiles-affine-traversal";

const hasDownloadableContent = (tile: Tile): boolean =>
  !!tile.internal?.hasContent && !!tile.content?.uri;

/** Installs admission and native traversal hooks on the renderer. */
export function installThreeTilesTraversalHooks(
  runtimeState: ThreeTilesRuntimeAttachmentState,
  dependencies: ThreeTilesRuntimeAttachmentDependencies,
  payloadQueues: ReturnType<typeof createThreeTilesPayloadQueues>
): void {
  if (!runtimeState.tiles) return;
  const requestTileContents = runtimeState.tiles.requestTileContents.bind(
    runtimeState.tiles
  );
  runtimeState.tiles.requestTileContents = (tile) => {
    const downloadable = hasDownloadableContent(tile);
    if (
      runtimeState.options.diagnostics === true &&
      runtimeState.options.tileTelemetry !== false &&
      (!downloadable || tile.internal.loadingState === UNLOADED_LOADING_STATE)
    ) {
      try {
        dependencies.recordTileRequestTrace?.(
          tile,
          "execution",
          downloadable
            ? dependencies.getTileRequestNeed(tile)
            : "no-downloadable-content"
        );
      } catch {
        // A trace-only demand query must not prevent the actual native request.
      }
    }
    // Routing containers have children, but no payload. Recheck here as well
    // as admission: native queued work and direct prefetch share this boundary.
    if (!downloadable) return;
    return requestTileContents(tile);
  };
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
  const canLoadReserve = () =>
    runtimeState.meshBaseCoverageReady &&
    runtimeState.extentFloorArmed &&
    (runtimeState.lastActiveViewsConverged ??
      runtimeState.lastMainViewConverged) &&
    runtimeState.effectiveErrorTarget === runtimeState.requestedErrorTarget &&
    runtimeState.map?.isMoving?.() !== true;
  let readyFamilyRegion:
    | ReturnType<typeof createMeshRegionCutQuery>
    | undefined;
  let publishedAncestors: Set<Tile> | undefined;
  let floorFamilyCoverage:
    | ReturnType<typeof createMeshFamilyCoverage>
    | undefined;
  const isFloorLeaf = (tile: Tile, extentError: number): boolean => {
    floorFamilyCoverage ??= createMeshFamilyCoverage();
    const family = floorFamilyCoverage(tile);
    if (family.unpreparedParents.size > 0) return false;
    const supportedBranches = new Set<Tile>();
    for (const member of family.support) {
      let current: Tile | null = member;
      while (current && current !== tile) {
        if (
          !current.internal ||
          (current.internal.hasUnrenderableContent &&
            (current.internal.loadingState !== LOADED_LOADING_STATE ||
              !current.children?.length)) ||
          (current.internal.hasRenderableContent &&
            !isMeshTileUnconditionallyRefined(current) &&
            isExtentFloorTile(current, extentError))
        )
          return false;
        if (current.parent === tile) supportedBranches.add(current);
        current = current.parent;
      }
    }
    readyFamilyRegion ??= createMeshRegionCutQuery(
      { has: isLoadedMesh },
      Number.MAX_VALUE,
      () => ({ intersects: true, errorPixels: 0 })
    );
    return (tile.children ?? []).every(
      (child) =>
        supportedBranches.has(child) || readyFamilyRegion!(child)?.length === 0
    );
  };
  const retainsPublishedChildren = (tile: Tile): boolean => {
    if (!publishedAncestors) {
      publishedAncestors = new Set();
      for (const displayed of runtimeState.displayedMeshFrontier)
        for (const parent of meshTileAncestors(displayed))
          publishedAncestors.add(parent);
    }
    return publishedAncestors.has(tile);
  };
  const waitingForSiblingCoverage = (tile: Tile): boolean => {
    let parent = tile.parent;
    while (
      parent &&
      (!parent.internal?.hasRenderableContent ||
        isMeshTileUnconditionallyRefined(parent))
    )
      parent = parent.parent;
    if (parent?.refine !== "REPLACE") return false;
    readyFamilyRegion ??= createMeshRegionCutQuery(
      { has: isLoadedMesh },
      Number.MAX_VALUE,
      () => ({ intersects: true, errorPixels: 0 })
    );
    // Query the children separately: the parent's own loaded payload is not
    // evidence that its demanded next level is complete. Routing JSON and
    // already-loaded finer replacements are handled by the shared cut query.
    return parent.children.some((child) => readyFamilyRegion!(child) === null);
  };
  const prepareForTraversal = runtimeState.tiles.prepareForTraversal.bind(
    runtimeState.tiles
  );
  const prepareAffineTraversal = createAffineTilesTraversalPreparation(
    runtimeState.tiles
  );
  runtimeState.tiles.prepareForTraversal = () => {
    readyFamilyRegion = undefined;
    floorFamilyCoverage = undefined;
    publishedAncestors = undefined;
    if (!prepareAffineTraversal()) prepareForTraversal();
    // Native update clears last frame's used pins before this preparation.
    // Repin here so its queued-job cleanup respects solar request retention.
    // Marking before update is too early; it is immediately cleared again.
    for (const tile of runtimeState.meshRefinementSupport)
      runtimeState.tiles?.markTileUsed(tile);
    for (const tile of runtimeState.retainedShadowRequests)
      if (runtimeState.tiles?.loadingTiles.has(tile))
        runtimeState.tiles.markTileUsed(tile);
    if (runtimeState.options.providesTerrain && runtimeState.shadowView) {
      for (const tile of runtimeState.committedMeshCasterFrontier)
        runtimeState.tiles?.markTileUsed(tile);
      for (const tile of runtimeState.pendingMeshCasterFrontier)
        runtimeState.tiles?.markTileUsed(tile);
      for (const tile of runtimeState.shadowCasterRequests) {
        dependencies.applyTileDeferral(tile, true);
        runtimeState.tiles?.markTileUsed(tile);
        runtimeState.tiles?.queueTileForDownload(tile);
      }
    }
  };
  // D1: the deferral decision rides on upstream's per-frame view error.
  const calculateTileViewErrorWithPlugin =
    runtimeState.tiles.calculateTileViewErrorWithPlugin.bind(
      runtimeState.tiles
    );
  runtimeState.tiles.calculateTileViewErrorWithPlugin = (tile, target) => {
    if (runtimeState.tileBoundsVisible) dependencies.recordTileIteration(tile);
    calculateTileViewErrorWithPlugin(tile, target);
    const runtimeTile = tile as RuntimeTile;
    const cameraDemand = dependencies.getTileCameraDemand(
      runtimeTile,
      runtimeState.options.providesTerrain === true
    );
    if (
      runtimeState.options.providesTerrain &&
      runtimeTile.engineData?.boundingVolume?.getAABB &&
      runtimeState.tileCameraDemand.views.length > 0
    ) {
      target.inView = cameraDemand.required;
      target.error =
        (cameraDemand.refinementErrorRatio ?? cameraDemand.errorRatio) *
        runtimeState.effectiveErrorTarget;
    } else if (
      target.inView &&
      runtimeTile.engineData?.boundingVolume?.getAABB &&
      runtimeState.tileCameraDemand.views.length > 0
    ) {
      // Decision: TILES_COVERAGE.md#camera-normalized-mesh-refinement.
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
    // Support is a prerequisite within current demand, never a second
    // source of visibility that can keep an old offscreen sibling alive.
    if (runtimeState.meshRefinementSupport.has(tile))
      runtimeState.tiles?.markTileUsed(tile);
    if (runtimeTile.zoomPrefetch) runtimeState.tiles?.markTileUsed(tile);
    runtimeTile.shadowReceiverCenterness = undefined;
    runtimeTile.shadowLightFacing = undefined;
    runtimeTile.shadowReceiverCurrent = undefined;
    if (
      !runtimeState.tileCameraDemand.views.some(
        (view) => view.id === TILE_SHADOW_CAMERA_ID
      ) &&
      runtimeState.shadowSelectionEnabled &&
      runtimeState.shadowReceiverMask &&
      !runtimeState.options.providesTerrain
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
    if (cameraDemand.required) {
      target.error = Math.max(
        target.inView ? target.error : 0,
        (cameraDemand.refinementErrorRatio ?? cameraDemand.errorRatio) *
          runtimeState.effectiveErrorTarget
      );
      target.inView = true;
    }
    // Idle rings retain bounded coarse coverage around a complete viewport.
    // Current shadow demand keeps its own error; new reserve work starts at
    // rest, while loaded reserve tiles stay pinned through camera movement.
    const skipStrategy =
      runtimeState.options.providesTerrain &&
      runtimeState.tiles?.loadAncestors === false;
    // Decision: TILES_COVERAGE.md#complete-replacement-families-and-resident-base-coverage.
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
      isFloorLeaf(tile, extentError);
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
      const atRest = canLoadReserve();
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
        // requested only after the view reaches requested quality. Convergence
        // at a relaxed memory floor must not refill optional ancestor payloads.
        runtimeState.tiles!.markTileUsed(tile);
        if (
          tile.internal.loadingState === UNLOADED_LOADING_STATE &&
          runtimeState.meshBaseCoverageReady &&
          (runtimeState.lastActiveViewsConverged ??
            runtimeState.lastMainViewConverged) &&
          runtimeState.effectiveErrorTarget ===
            runtimeState.requestedErrorTarget &&
          runtimeState.memoryErrorTarget <= runtimeState.requestedErrorTarget &&
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
      // Decision: OFFSCREEN-CASTERS in
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
    // Complete the next demanded family before drilling into its loaded
    // branches. Missing screen regions keep their independent fill priority.
    // Existing fine cuts and exhausted payloads must remain traversable.
    // Shadow prerequisites also enter retainedMeshAncestors, but they are only
    // requested detail: they must not bypass this family-loading barrier.
    if (
      runtimeState.options.providesTerrain &&
      target.inView &&
      tile.internal.hasRenderableContent &&
      !isMeshTileUnconditionallyRefined(tile) &&
      !retainsPublishedChildren(tile) &&
      !runtimeState.tileRetries.isExhausted(tile) &&
      waitingForSiblingCoverage(tile)
    )
      target.error = Math.min(target.error, runtimeState.effectiveErrorTarget);
    const explicitCaster =
      !!runtimeState.shadowView &&
      runtimeState.options.providesTerrain &&
      (runtimeState.shadowCasterRequests.has(tile) ||
        runtimeState.committedMeshCasterFrontier.has(tile));
    if (explicitCaster) runtimeTile.shadowReceiverCurrent = true;
    dependencies.applyTileDeferral(
      tile,
      target.inView ||
        explicitCaster ||
        runtimeState.meshRefinementSupport.has(tile)
    );
  };
  const queueTileForDownload = runtimeState.tiles.queueTileForDownload.bind(
    runtimeState.tiles
  );
  runtimeState.tiles.queueTileForDownload = (tile) => {
    const tiles = runtimeState.tiles;
    if (!tiles) return;
    if (!hasDownloadableContent(tile)) {
      if (
        runtimeState.options.diagnostics === true &&
        runtimeState.options.tileTelemetry !== false
      )
        dependencies.recordTileRequestTrace?.(
          tile,
          "admission",
          "no-downloadable-content"
        );
      return;
    }
    if (runtimeState.memoryAdmissionPaused || runtimeState.loadingPaused)
      return;
    if (
      tile.internal.loadingState !== UNLOADED_LOADING_STATE ||
      runtimeState.queuedThisTraversal.has(tile)
    )
      return;
    const runtimeTile = tile as RuntimeTile;
    const requestNeed = dependencies.getTileRequestNeed(tile);
    if (
      runtimeState.options.diagnostics === true &&
      runtimeState.options.tileTelemetry !== false
    )
      dependencies.recordTileRequestTrace?.(tile, "admission", requestNeed);
    const cameraRequest =
      requestNeed === TILE_REQUEST_NEED.CAMERA ||
      requestNeed === TILE_REQUEST_NEED.SHADOW;
    const coverageFill =
      runtimeState.meshCoverageRecovery &&
      dependencies.isTileNeededForMeshCoverage(tile);
    if (
      resolveTileRequestAdmission({
        needed: requestNeed !== null,
        coveragePrerequisite: isTileCoveragePrerequisite(requestNeed),
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
    if (
      runtimeState.options.providesTerrain &&
      !floorTile &&
      !supportTile &&
      !coverageFill &&
      !cameraRequest &&
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
      !cameraRequest &&
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
        runtimeState.tiles.loadAncestors
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
    // Receiver and caster selection explicitly own complete replacement
    // families; siblings use the same bounded queues as direct camera demand.
    dependencies.assignTilePriority(runtimeTile);
    runtimeState.queuedThisTraversal.add(tile);
    if (
      runtimeState.options.diagnostics &&
      runtimeState.options.tileTelemetry !== false
    )
      dependencies.getTileDebugProgress(tile).queuedAt ??= performance.now();
    dependencies.noteTileActivity(tile);
    runtimeTile.firstPublicationRequestedAt = performance.now();
    payloadQueues.makeRoomForRequest(tile);
    queueTileForDownload(tile);
  };
}
