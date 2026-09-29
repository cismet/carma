import {
  selectMeshShadowRetrieval,
  meshContentLevel,
} from "../../core/mesh-shadow-retrieval";
import {
  hasDisplayedAncestor,
  meshTileAncestors,
} from "../../core/mesh-tile-coverage";
import { holdMeshReceiversForCasters } from "../../core/mesh-shadow-receiver-handover";
import { createCasterVolumeDemand } from "./three-tiles-runtime-caster-demand";
import type { Tile } from "3d-tiles-renderer/core";
import * as THREE from "three";

import {
  createShadowReceiverMask,
  maximumSweepDistanceWithinBox,
  type ShadowReceiverSource,
} from "../../core/shadow-receiver-mask";
import { clipShadowReceiverSources } from "../../core/shadow-receiver-sources";
import type { SharedThreeSceneTileVolume } from "../../core/shared-three-scene-types";
import { readOrientedTileBounds } from "./three-tiles-bounds";

import type { ThreeTilesShadowsState } from "./three-tiles-runtime-shadows";
import type { ThreeTilesRuntimeServices } from "./three-tiles-runtime-context";
import type { RuntimeTile } from "./three-tiles-runtime-types";

/** Builds receiver masks and publishes the current caster and receiver cuts. */
export function createThreeTilesShadowPublication(
  runtimeState: ThreeTilesShadowsState,
  dependencies: Pick<
    ThreeTilesRuntimeServices,
    | "isTileInMainView"
    | "updateFrameFromTiles"
    | "updateRootWorldBounds"
    | "getTileScreenError"
    | "getTileCenterness"
    | "getTileDebugId"
    | "recordTileWait"
    | "requestRender"
    | "isPipelineIdle"
    | "setShadowSelectionEnabled"
    | "currentShadowPathConverged"
    | "invalidateShadowRegionRevisions"
  >
) {
  const getTileLoadReason: ThreeTilesRuntimeServices["getTileLoadReason"] = (
    tile: RuntimeTile
  ): SharedThreeSceneTileVolume["loadReason"] => {
    if (runtimeState.options.providesTerrain && runtimeState.shadowView) {
      return runtimeState.committedMeshReceiverFrontier.has(tile)
        ? "viewport"
        : "shadow";
    }
    if (dependencies.isTileInMainView(tile)) return "viewport";
    return "shadow";
  };

  const createReceiverSnapshot: ThreeTilesRuntimeServices["createReceiverSnapshot"] =
    (frontier: ReadonlySet<Tile>) => {
      const sourceCamera = runtimeState.shadowView?.camera;
      if (
        !runtimeState.tiles ||
        !(sourceCamera instanceof THREE.OrthographicCamera) ||
        !runtimeState.viewFrustumsReady
      ) {
        return null;
      }

      sourceCamera.updateMatrixWorld(true);
      runtimeState.tiles.group.updateWorldMatrix(true, false);
      dependencies.updateFrameFromTiles();
      if (!dependencies.updateRootWorldBounds()) return null;
      sourceCamera
        .getWorldDirection(runtimeState.sunwardDirection)
        .negate()
        .transformDirection(runtimeState.currentToReference);
      runtimeState.tilesToShadowView.multiplyMatrices(
        sourceCamera.matrixWorldInverse,
        runtimeState.tiles.group.matrixWorld
      );
      const receivers = [...frontier]
        .filter((tile) => dependencies.isTileInMainView(tile as RuntimeTile))
        .map((tile) => ({
          tile: tile as RuntimeTile,
          // Decision: ../../../../TILES_COVERAGE.md#caster-lod-follows-displayed-receivers.
          // Shadow demand must not feed back into its own receiver density.
          screenErrorPixels: dependencies.getTileScreenError(
            tile as RuntimeTile,
            false
          ),
        }));
      // View clipping changes even when the same coarse receivers remain.
      const signature = JSON.stringify([
        runtimeState.shadowViewSignature,
        runtimeState.tileCameraSignature,
        runtimeState.tiles.group.matrixWorld.elements,
        runtimeState.requestedErrorTarget,
        runtimeState.shadowView?.terrainReceivers,
        receivers
          .map(({ tile, screenErrorPixels }) => [
            dependencies.getTileDebugId(tile),
            tile.geometricError,
            screenErrorPixels,
          ])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      ]);
      // Finite-disc paints do not change receiver demand. Test the complete
      // demand identity BEFORE rebuilding the spatial index. Pixel error is
      // part of it: the same tile IDs can require finer casters after zooming.
      if (
        signature === runtimeState.shadowReceiverSourceSignature &&
        runtimeState.shadowReceiverMask
      ) {
        return {
          signature,
          mask: runtimeState.shadowReceiverMask,
          sourceTiles: runtimeState.mainViewSourceTiles,
        };
      }
      const sources: ShadowReceiverSource[] = [];
      const sourceTiles = new Set<Tile>();
      // Decision: engines/maplibre/README.md#lod2-terrain-corridor-reuse.
      // Ground receivers belong to the independent DEM, not the building tree.
      // Ground receivers arrive in frame space, like every shadow-facing box.
      const worldToTiles = runtimeState.frameFromTiles.clone().invert();
      for (const receiver of runtimeState.options.providesTerrain
        ? []
        : runtimeState.shadowView?.terrainReceivers ?? []) {
        const bounds = new THREE.Box3(
          new THREE.Vector3(...receiver.minimum),
          new THREE.Vector3(...receiver.maximum)
        );
        sources.push({
          bounds,
          boundsTransform: worldToTiles,
          geometricError: receiver.geometricError ?? 1,
          screenErrorPixels:
            receiver.errorPixels ?? runtimeState.requestedErrorTarget,
          centerness: 1,
          maximumCasterDistance: maximumSweepDistanceWithinBox(
            bounds,
            runtimeState.rootWorldBoundingBox,
            runtimeState.sunwardDirection
          ),
        });
      }
      for (const { tile, screenErrorPixels } of receivers) {
        const bounds = tile.engineData?.boundingVolume;
        if (!bounds?.getAABB) continue;
        readOrientedTileBounds(
          bounds,
          runtimeState.tileBoundingBox,
          runtimeState.tileBoundsTransform
        );
        if (!runtimeState.tileBoundingBox.isEmpty()) {
          runtimeState.sourceWorldBoundsTransform.multiplyMatrices(
            runtimeState.frameFromTiles,
            runtimeState.tileBoundsTransform
          );
          runtimeState.sourceWorldBoundingBox
            .copy(runtimeState.tileBoundingBox)
            .applyMatrix4(runtimeState.sourceWorldBoundsTransform);
          sources.push({
            bounds: runtimeState.tileBoundingBox.clone(),
            boundsTransform: runtimeState.tileBoundsTransform.clone(),
            maximumCasterDistance: maximumSweepDistanceWithinBox(
              runtimeState.sourceWorldBoundingBox,
              runtimeState.rootWorldBoundingBox,
              runtimeState.sunwardDirection
            ),
            geometricError: tile.geometricError,
            contentLevel: runtimeState.options.providesTerrain
              ? meshContentLevel(tile)
              : undefined,
            // Match the displayed geometry. A looser rounded stage could stop
            // traversal above siblings required by the caster-family publisher.
            screenErrorPixels,
            centerness: dependencies.getTileCenterness(bounds),
          });
        }
        let source: Tile | null = tile;
        while (source) {
          sourceTiles.add(source);
          source = source.parent;
        }
      }
      return {
        signature,
        mask: createShadowReceiverMask(
          clipShadowReceiverSources(
            sources,
            runtimeState.tileCameraDemand,
            runtimeState.tiles.group.matrixWorld
          ),
          runtimeState.tilesToShadowView,
          runtimeState.options.providesTerrain
            ? 0
            : runtimeState.shadowView?.casterAngularRadiusRadians
        ),
        sourceTiles,
      };
    };

  const captureReceiverSources = (receiverOverride?: ReadonlySet<Tile>) => {
    if (!runtimeState.tiles) return "empty" as const;
    // Offscreen casters must not seed receivers and recursively grow demand.
    const receiverFrontier =
      receiverOverride ??
      (!runtimeState.options.providesTerrain
        ? runtimeState.tiles.visibleTiles
        : runtimeState.displayedMeshFrontier);
    const snapshot = createReceiverSnapshot(receiverFrontier);
    if (!snapshot) return "empty" as const;
    const { signature: nextSignature, mask: nextMask, sourceTiles } = snapshot;
    if (nextSignature === runtimeState.shadowReceiverSourceSignature) {
      return "unchanged" as const;
    }
    // There is one current union: viewport receivers plus their sunward
    // corridor. Keeping the previous mask alive would retain and request tiles
    // that belong to neither after a view change.
    runtimeState.shadowReceiverMask = nextMask;
    if (!runtimeState.options.providesTerrain)
      runtimeState.shadowRegionRevisions.clear();
    // Receiver membership changed with the observer, but existing per-receiver
    // corridor proofs remain valid for the same sun direction and source cut.
    // Their bounds and error target are already part of the cache key.
    runtimeState.shadowReceiverMaskConverged = false;
    runtimeState.shadowReceiverSourceSignature = nextSignature;
    runtimeState.mainViewSourceTiles.clear();
    for (const tile of sourceTiles) runtimeState.mainViewSourceTiles.add(tile);
    return "updated" as const;
  };

  const enableShadowSelection = (receiverOverride?: ReadonlySet<Tile>) => {
    if (
      !runtimeState.shadowView ||
      !runtimeState.tiles ||
      !runtimeState.cameraSet ||
      (runtimeState.tiles.group.children.length === 0 &&
        !runtimeState.shadowView.terrainReceivers?.length)
    ) {
      return false;
    }
    const receiverUpdate = captureReceiverSources(receiverOverride);
    if (receiverUpdate === "empty") {
      // A transient empty upstream cut while REPLACE children stream must not
      // discard the last useful sunward demand. The next non-empty traversal
      // replaces it directly.
      return false;
    }
    runtimeState.shadowSelectionRefreshPending = false;
    if (receiverUpdate === "unchanged" && runtimeState.shadowSelectionEnabled)
      return true;
    if (runtimeState.shadowSelectionEnabled) {
      runtimeState.shadowSelectionNeedsTraversal = true;
    } else {
      dependencies.setShadowSelectionEnabled(true);
    }
    runtimeState.tiles.dispatchEvent({ type: "needs-update" });
    dependencies.requestRender();
    return true;
  };

  const maybeFinalizeShadowSelection: ThreeTilesRuntimeServices["maybeFinalizeShadowSelection"] =
    () => {
      if (
        !runtimeState.tiles ||
        runtimeState.pendingMeshReceiverFrontier !== null ||
        !runtimeState.shadowSelectionEnabled ||
        runtimeState.shadowReceiverMaskConverged ||
        runtimeState.shadowSelectionNeedsTraversal ||
        !dependencies.isPipelineIdle() ||
        !dependencies.currentShadowPathConverged()
      ) {
        return;
      }
      runtimeState.shadowReceiverMaskConverged = true;
      runtimeState.tiles.dispatchEvent({ type: "needs-update" });
      dependencies.requestRender();
    };

  let requestCameraSignature: string | undefined;

  const advanceMeshShadowCorridors: ThreeTilesRuntimeServices["advanceMeshShadowCorridors"] =
    (viewportTiles: ReadonlySet<Tile>): void => {
      const tiles = runtimeState.tiles;
      const root = tiles?.root;
      if (!tiles || !root || !runtimeState.shadowView) return;
      let receivers = new Set(
        [...viewportTiles].filter((tile) =>
          dependencies.isTileInMainView(tile as RuntimeTile)
        )
      );
      const previousReceivers = runtimeState.committedMeshReceiverFrontier;
      if (runtimeState.meshCoverageRecovery && previousReceivers.size) {
        const uncovered = new Set(
          [...receivers].filter(
            (tile) => !hasDisplayedAncestor(tile, previousReceivers)
          )
        );
        const missingSnapshot = createReceiverSnapshot(uncovered);
        const missingDemand = createCasterVolumeDemand(
          missingSnapshot?.mask ?? null,
          runtimeState.requestedErrorTarget
        );
        // A shadow prerequisite is foreground only when it helps fill a hole.
        // Do not grow corridors for optional refinements of already covered
        // regions. A covered family may still refine to cast into a new hole.
        receivers = holdMeshReceiversForCasters(
          receivers,
          previousReceivers,
          (tile) => {
            if (uncovered.has(tile)) return true;
            for (const parent of meshTileAncestors(tile)) {
              if (!previousReceivers.has(parent)) continue;
              return (
                (missingDemand(parent).receiverContentLevel ?? -1) >
                meshContentLevel(parent)
              );
            }
            return false;
          }
        ).receivers;
      }
      const previousCasters = runtimeState.committedMeshCasterFrontier;
      // First plan the next receiver/caster generation without publishing it.
      // Its requests keep running while each affected receiver family holds its
      // old, compatible generation. Unrelated ready families still advance.
      const candidateSnapshot = createReceiverSnapshot(receivers);
      const candidate = selectMeshShadowRetrieval(
        root,
        receivers,
        previousCasters,
        runtimeState.requestedErrorTarget,
        createCasterVolumeDemand(
          candidateSnapshot?.mask ?? null,
          runtimeState.requestedErrorTarget
        )
      );
      let publishedReceivers = receivers;
      let plan = candidate;
      // Holding one family can withdraw a caster another proposed family needs.
      // Propagate that dependency before publishing. Each pass only removes new
      // receivers or restores old parents, so this reaches a finite fixed point.
      for (;;) {
        const handover = holdMeshReceiversForCasters(
          publishedReceivers,
          previousReceivers,
          (tile) => {
            if (!candidateSnapshot) return false;
            if (plan.missing.length === 0) return true;
            const region = createReceiverSnapshot(new Set([tile]));
            if (!region) return false;
            const demand = createCasterVolumeDemand(
              region.mask,
              runtimeState.requestedErrorTarget
            );
            return !plan.missing.some((missing) => demand(missing).intersects);
          }
        );
        if (
          handover.receivers.size === publishedReceivers.size &&
          [...handover.receivers].every((tile) => publishedReceivers.has(tile))
        )
          break;
        publishedReceivers = handover.receivers;
        const snapshot = createReceiverSnapshot(publishedReceivers);
        plan = selectMeshShadowRetrieval(
          root,
          publishedReceivers,
          previousCasters,
          runtimeState.requestedErrorTarget,
          createCasterVolumeDemand(
            snapshot?.mask ?? null,
            runtimeState.requestedErrorTarget
          )
        );
      }
      const pending = new Set(
        [...receivers].filter((tile) => !publishedReceivers.has(tile))
      );
      const previousPending = runtimeState.pendingMeshReceiverFrontier;
      const pendingChanged =
        pending.size !== (previousPending?.size ?? 0) ||
        [...pending].some((tile) => !previousPending?.has(tile));
      runtimeState.committedMeshReceiverFrontier = publishedReceivers;
      runtimeState.pendingMeshReceiverFrontier = pending.size ? pending : null;
      runtimeState.pendingMeshReceiverMask = pending.size
        ? candidateSnapshot?.mask ?? null
        : null;
      runtimeState.pendingMeshCasterFrontier = pending.size
        ? new Set(candidate.casters)
        : new Set();
      enableShadowSelection(publishedReceivers);
      // Future compatible geometry is owned and pinned just like a running
      // request; the native cache must not evict it while its family completes.
      for (const tile of candidate.casters) tiles.markTileUsed(tile);
      for (const tile of pending) tiles.markTileUsed(tile);
      for (const tile of candidate.requests) plan.requests.add(tile);
      for (const tile of candidate.unpreparedParents)
        plan.unpreparedParents.add(tile);
      for (const parent of plan.unpreparedParents)
        tiles.ensureChildrenArePreprocessed(parent);
      // Native traversal can propose a different receiver cut while the same
      // view is loading. Finish caster jobs owned by that view rather than
      // cancelling them between proposed cuts and immediately starting again.
      // A camera change still drops obsolete work through normal admission.
      if (requestCameraSignature === runtimeState.tileCameraSignature)
        for (const tile of runtimeState.shadowCasterRequests)
          if (tiles.loadingTiles.has(tile)) plan.requests.add(tile);
      requestCameraSignature = runtimeState.tileCameraSignature;
      const requestsChanged =
        plan.requests.size !== runtimeState.shadowCasterRequests.size ||
        [...plan.requests].some(
          (tile) => !runtimeState.shadowCasterRequests.has(tile)
        );
      runtimeState.shadowCasterRequests = plan.requests;
      runtimeState.shadowReceiverMaskConverged =
        plan.converged && pending.size === 0;
      if (requestsChanged || pendingChanged || plan.unpreparedParents.size) {
        runtimeState.shadowSelectionNeedsTraversal = true;
        tiles.dispatchEvent({ type: "needs-update" });
        dependencies.requestRender();
      }
      const casterCut = plan.casters;
      if (
        casterCut.size !== previousCasters.size ||
        [...casterCut].some((tile) => !previousCasters.has(tile))
      )
        runtimeState.committedMeshCasterFrontier = casterCut;
      // A proof can be negative between decode and publication. Geometry load
      // invalidation alone never clears that cached false after the cut changes.
      const changed = [...new Set([...previousCasters, ...casterCut])].filter(
        (tile) => previousCasters.has(tile) !== casterCut.has(tile)
      );
      if (changed.length > 0) {
        const changedBounds: THREE.Box3[] = [];
        let unknownBounds = false;
        for (const tile of changed) {
          const volume = (tile as RuntimeTile).engineData?.boundingVolume;
          if (!volume?.getAABB) {
            unknownBounds = true;
            break;
          }
          const bounds = new THREE.Box3();
          const transform = new THREE.Matrix4();
          readOrientedTileBounds(volume, bounds, transform);
          transform.premultiply(dependencies.updateFrameFromTiles());
          changedBounds.push(bounds.applyMatrix4(transform));
        }
        dependencies.invalidateShadowRegionRevisions(
          unknownBounds ? undefined : changedBounds
        );
        // Decoded geometry may enter/leave the selected cut much later. Its
        // publication changes the depth pass too, even without another load
        // event. The host coalesces these regional buffer invalidations.
        runtimeState.options.onContentChanged?.(
          unknownBounds ? undefined : changedBounds
        );
      }
      for (const tile of runtimeState.committedMeshReceiverFrontier)
        runtimeState.tiles.markTileUsed(tile);
      for (const tile of runtimeState.committedMeshCasterFrontier)
        runtimeState.tiles.markTileUsed(tile);
    };

  return {
    getTileLoadReason,
    createReceiverSnapshot,
    captureShadowReceiverSources: () => captureReceiverSources(),
    maybeEnableShadowSelection: () => {
      enableShadowSelection();
    },
    maybeFinalizeShadowSelection,
    advanceMeshShadowCorridors,
  };
}
