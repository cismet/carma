import {
  selectShadowCasterPlan,
  selectShadowReadyReceivers,
} from "../../core/mesh-shadow-publication";
import { getReadyMeshRegionCut } from "../../core/mesh-tile-coverage";
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
import type { RuntimeLruCache, RuntimeTile } from "./three-tiles-runtime-types";

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
      for (const receiver of runtimeState.shadowView?.terrainReceivers ?? []) {
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
          runtimeState.shadowView?.casterAngularRadiusRadians
        ),
        sourceTiles,
      };
    };

  const captureShadowReceiverSources: ThreeTilesRuntimeServices["captureShadowReceiverSources"] =
    () => {
      if (!runtimeState.tiles) return "empty" as const;
      // Pass 1 owns receiver demand. Offscreen caster tiles from pass 2 must not
      // recursively become receivers and grow the requested region city-wide.
      const receiverFrontier = !runtimeState.options.providesTerrain
        ? runtimeState.tiles.visibleTiles
        : new Set([
            ...runtimeState.committedMeshReceiverFrontier,
            ...(runtimeState.pendingMeshReceiverFrontier ??
              runtimeState.displayedMeshFrontier),
          ]);
      const snapshot = createReceiverSnapshot(receiverFrontier);
      if (!snapshot) return "empty" as const;
      const {
        signature: nextSignature,
        mask: nextMask,
        sourceTiles,
      } = snapshot;
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
      for (const tile of sourceTiles)
        runtimeState.mainViewSourceTiles.add(tile);
      return "updated" as const;
    };

  const maybeEnableShadowSelection: ThreeTilesRuntimeServices["maybeEnableShadowSelection"] =
    () => {
      if (
        !runtimeState.shadowView ||
        !runtimeState.tiles ||
        !runtimeState.cameraSet ||
        (runtimeState.tiles.group.children.length === 0 &&
          !runtimeState.shadowView.terrainReceivers?.length)
      ) {
        return;
      }
      const receiverUpdate = captureShadowReceiverSources();
      if (receiverUpdate === "empty") {
        // A transient empty upstream cut while REPLACE children stream must not
        // discard the last useful sunward demand. The next non-empty traversal
        // replaces it directly.
        return;
      }
      runtimeState.shadowSelectionRefreshPending = false;
      if (receiverUpdate === "unchanged" && runtimeState.shadowSelectionEnabled)
        return;
      if (runtimeState.shadowSelectionEnabled) {
        runtimeState.shadowSelectionNeedsTraversal = true;
      } else {
        dependencies.setShadowSelectionEnabled(true);
      }
      runtimeState.tiles.dispatchEvent({ type: "needs-update" });
      dependencies.requestRender();
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

  const advanceMeshShadowCorridors: ThreeTilesRuntimeServices["advanceMeshShadowCorridors"] =
    (
      viewportTiles: ReadonlySet<Tile>,
      traversalTiles: ReadonlySet<Tile>
    ): void => {
      if (!runtimeState.tiles || !runtimeState.shadowView) return;
      runtimeState.pendingMeshReceiverFrontier = new Set(
        [...viewportTiles].filter((tile) =>
          dependencies.isTileInMainView(tile as RuntimeTile)
        )
      );
      if (runtimeState.pendingMeshReceiverFrontier.size === 0) return;
      const previousCasters = runtimeState.committedMeshCasterFrontier;
      const previousReceivers = runtimeState.committedMeshReceiverFrontier;
      const candidates = runtimeState.pendingMeshReceiverFrontier;
      maybeEnableShadowSelection();

      const casterDemand = createCasterVolumeDemand(
        runtimeState.shadowReceiverMask,
        runtimeState.requestedErrorTarget
      );
      // Upstream visibleTiles can withhold an already decoded caster behind
      // unrelated REPLACE siblings. Membership comes from resident metadata;
      // progressive publication retains a parent until its demanded cut is covered.
      // A tile may be both a receiver and a caster; Set union keeps it once.
      const residentTiles =
        (runtimeState.tiles.lruCache as RuntimeLruCache | undefined)
          ?.itemList ?? [];
      const proposed = new Set(
        [
          ...new Set([...traversalTiles, ...previousCasters, ...residentTiles]),
        ].filter((tile) => {
          const runtimeTile = tile as RuntimeTile;
          // Decision: CASTER-FAMILY-HANDOVER-20260909 in engines/maplibre/README.md.
          // A retained parent may overlap the camera while its offscreen
          // children are loading. Keep it in depth, not in the colour cut.
          if (
            dependencies.isTileInMainView(runtimeTile) &&
            !previousCasters.has(tile)
          )
            return candidates.has(tile) || previousReceivers.has(tile);
          if (
            !runtimeTile.engineData?.scene &&
            tile.internal?.loadingState !== 4
          )
            return false;
          const volume = runtimeTile.engineData?.boundingVolume;
          if (!volume?.getAABB || !runtimeState.shadowReceiverMask)
            return previousCasters.has(tile);
          readOrientedTileBounds(
            volume,
            runtimeState.tileBoundingBox,
            runtimeState.tileBoundsTransform
          );
          // Membership is metadata geometry, never a stale traversal flag or
          // the payload's current self-shadow result. Preserve loaded casters
          // still in the union while the next upstream cut is being assembled.
          const intersects = runtimeState.shadowReceiverMask.match(
            runtimeState.tileBoundingBox,
            runtimeState.shadowReceiverMatch,
            runtimeState.tileBoundsTransform,
            { key: tile, parent: tile.parent ?? undefined }
          );
          runtimeTile.shadowReceiverCurrent = intersects;
          runtimeTile.shadowReceiverCenterness = intersects
            ? runtimeState.shadowReceiverMatch.receiverCenterness
            : undefined;
          return intersects;
        })
      );
      for (const tile of runtimeState.committedMeshReceiverFrontier)
        proposed.add(tile);
      const casterCut = selectShadowCasterPlan(
        proposed,
        previousCasters,
        candidates,
        (tile) => dependencies.isTileInMainView(tile as RuntimeTile),
        (tile) => {
          const volume = (tile as RuntimeTile).engineData?.boundingVolume;
          if (!volume?.getAABB || !runtimeState.shadowReceiverMask) return true;
          readOrientedTileBounds(
            volume,
            runtimeState.tileBoundingBox,
            runtimeState.tileBoundsTransform
          );
          return runtimeState.shadowReceiverMask.match(
            runtimeState.tileBoundingBox,
            runtimeState.shadowReceiverMatch,
            runtimeState.tileBoundsTransform,
            { key: tile, parent: tile.parent ?? undefined }
          );
        },
        (tile) => casterDemand(tile).errorPixels,
        runtimeState.effectiveErrorTarget
      );
      // Ready light-frustum children contribute immediately; their parent
      // remains a conservative caster until all required branches are covered.
      // Camera-only demand never creates a transitive shadow-corridor request.
      runtimeState.committedMeshCasterFrontier = casterCut;
      const root = runtimeState.tiles.rootTileset?.root;
      const receiverPlan = root
        ? selectShadowReadyReceivers(
            root,
            candidates,
            previousReceivers,
            (tile) => dependencies.isTileInMainView(tile as RuntimeTile),
            (tile) => {
              const snapshot = createReceiverSnapshot(new Set([tile]));
              return (
                !!snapshot?.mask &&
                getReadyMeshRegionCut(
                  root,
                  casterCut,
                  Number.MAX_VALUE,
                  createCasterVolumeDemand(
                    snapshot.mask,
                    runtimeState.requestedErrorTarget
                  )
                ) !== null
              );
            }
          )
        : { receivers: previousReceivers, pending: candidates };
      runtimeState.committedMeshReceiverFrontier = receiverPlan.receivers;
      for (const receiver of receiverPlan.receivers) casterCut.add(receiver);
      runtimeState.pendingMeshReceiverFrontier = receiverPlan.pending.size
        ? receiverPlan.pending
        : null;
      for (const tile of receiverPlan.pending)
        dependencies.recordTileWait?.(tile, "receiver", "shadow-render");
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
    captureShadowReceiverSources,
    maybeEnableShadowSelection,
    maybeFinalizeShadowSelection,
    advanceMeshShadowCorridors,
  };
}
