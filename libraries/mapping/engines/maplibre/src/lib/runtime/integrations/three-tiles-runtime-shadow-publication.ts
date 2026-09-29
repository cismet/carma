import type { Tile } from "3d-tiles-renderer/core";
import * as THREE from "three";

import {
  excludeMeshReceiverAncestors,
  selectMeshShadowRetrieval,
  meshContentLevel,
} from "../../core/mesh-shadow-retrieval";
import { createCasterVolumeDemand } from "./three-tiles-runtime-caster-demand";
import {
  createShadowReceiverMask,
  maximumSweepDistanceWithinBox,
  type ShadowReceiverSource,
} from "../../core/shadow-receiver-mask";
import {
  SHADOW_RECEIVER_CAPTURE,
  clipShadowReceiverSources,
} from "../../core/shadow-receiver-sources";
import type { SharedThreeSceneTileVolume } from "../../core/shared-three-scene-types";
import { TILE_VOLUME_LOAD_REASON } from "../../core/tile-volume";
import { readOrientedTileBounds } from "./three-tiles-bounds";

import { MESH_SHADOW_RESERVE_PHASE } from "./three-tiles-runtime-config";
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
        ? TILE_VOLUME_LOAD_REASON.VIEWPORT
        : TILE_VOLUME_LOAD_REASON.SHADOW;
    }
    if (dependencies.isTileInMainView(tile))
      return TILE_VOLUME_LOAD_REASON.VIEWPORT;
    return TILE_VOLUME_LOAD_REASON.SHADOW;
  };

  const createReceiverSnapshot = (
    frontier: ReadonlySet<Tile>
  ): ReturnType<ThreeTilesRuntimeServices["createReceiverSnapshot"]> => {
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
    if (!runtimeState.tiles) return SHADOW_RECEIVER_CAPTURE.EMPTY;
    // Offscreen casters must not seed receivers and recursively grow demand.
    const receiverFrontier =
      receiverOverride ??
      (!runtimeState.options.providesTerrain
        ? runtimeState.tiles.visibleTiles
        : runtimeState.displayedMeshFrontier);
    const snapshot = createReceiverSnapshot(receiverFrontier);
    if (!snapshot) return SHADOW_RECEIVER_CAPTURE.EMPTY;
    const { signature: nextSignature, mask: nextMask, sourceTiles } = snapshot;
    if (nextSignature === runtimeState.shadowReceiverSourceSignature) {
      return SHADOW_RECEIVER_CAPTURE.UNCHANGED;
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
    return SHADOW_RECEIVER_CAPTURE.UPDATED;
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
    if (receiverUpdate === SHADOW_RECEIVER_CAPTURE.EMPTY) {
      // A transient empty upstream cut while REPLACE children stream must not
      // discard the last useful sunward demand. The next non-empty traversal
      // replaces it directly.
      return false;
    }
    runtimeState.shadowSelectionRefreshPending = false;
    if (
      receiverUpdate === SHADOW_RECEIVER_CAPTURE.UNCHANGED &&
      runtimeState.shadowSelectionEnabled
    )
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
      const proposed = new Set(
        [...viewportTiles].filter((tile) =>
          dependencies.isTileInMainView(tile as RuntimeTile)
        )
      );
      const previousCasters = runtimeState.committedMeshCasterFrontier;
      runtimeState.committedMeshReceiverFrontier = proposed;
      // Only displayed receivers seed the corridor; casters never become
      // receivers merely because they were loaded for someone else's shadow.
      enableShadowSelection(proposed);
      const demand = createCasterVolumeDemand(
        runtimeState.shadowReceiverMask,
        runtimeState.requestedErrorTarget
      );
      const plan = selectMeshShadowRetrieval(
        root,
        viewportTiles,
        previousCasters,
        runtimeState.requestedErrorTarget,
        demand,
        (tile) => dependencies.isTileInMainView(tile as RuntimeTile)
      );
      const requests = new Set(plan.requests);
      if (requestCameraSignature === runtimeState.tileCameraSignature)
        for (const tile of runtimeState.shadowCasterRequests)
          if (tiles.loadingTiles.has(tile)) requests.add(tile);
      requestCameraSignature = runtimeState.tileCameraSignature;
      const requestsChanged =
        requests.size !== runtimeState.shadowCasterRequests.size ||
        [...requests].some(
          (tile) => !runtimeState.shadowCasterRequests.has(tile)
        );
      runtimeState.shadowCasterRequests = requests;
      runtimeState.pendingMeshCasterFrontier = new Set(plan.support);
      // The coarse extent reserve remains owned by the normal loader. This
      // field now reports only the current offscreen caster plan, not a global
      // readiness gate or a second colour/material owner.
      runtimeState.meshShadowReserve = {
        frontier: new Set(),
        support: new Set(),
        ready: plan.converged,
        known: plan.support.size,
        covered: plan.casters.size,
        totalKnown: !plan.unpreparedParents.size,
        pending: {
          phase: plan.blocked.size
            ? MESH_SHADOW_RESERVE_PHASE.BLOCKED
            : plan.unpreparedParents.size
            ? MESH_SHADOW_RESERVE_PHASE.METADATA
            : plan.converged
            ? MESH_SHADOW_RESERVE_PHASE.READY
            : MESH_SHADOW_RESERVE_PHASE.LOADING,
          required: plan.support.size,
          missing: plan.requests.size,
          blocked: plan.blocked.size,
        },
      };
      for (const tile of plan.support) tiles.markTileUsed(tile);
      for (const parent of plan.unpreparedParents)
        tiles.ensureChildrenArePreprocessed(parent);
      runtimeState.shadowReceiverMaskConverged = plan.converged;
      if (requestsChanged || plan.unpreparedParents.size) {
        runtimeState.shadowSelectionNeedsTraversal = true;
        tiles.dispatchEvent({ type: "needs-update" });
        dependencies.requestRender();
      }
      // Shared visible objects cast directly. Only plan.casters are extra.
      const casterCut = excludeMeshReceiverAncestors(
        new Set([...proposed, ...plan.casters]),
        viewportTiles
      );
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
