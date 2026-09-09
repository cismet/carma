import { type Tile } from "3d-tiles-renderer/core";
import * as THREE from "three";

import {
  createShadowReceiverMask,
  maximumSweepDistanceWithinBox,
  receiverMatchedTileError,
  type ShadowReceiverMask,
  type ShadowReceiverSource,
} from "../../core/shadow-receiver-mask";
import type { SharedThreeSceneTileVolume } from "../../core/shared-three-scene-types";
import { readOrientedTileBounds } from "./three-tiles-bounds";
import { meshShadowStageError } from "./three-tiles-load-policy";
import {
  getReadyMeshRegionCut,
  refineLoadedMeshFrontier,
} from "./three-tiles-mesh-frontier";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import type { RuntimeLruCache, RuntimeTile } from "./three-tiles-runtime-types";

/** shadows responsibility of the shared 3D Tiles runtime. */
export function createThreeTilesShadows(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    | "shadowReceiverMask"
    | "shadowReceiverMaskConverged"
    | "shadowReceiverSourceSignature"
    | "mainViewSourceTiles"
    | "shadowSelectionRefreshPending"
    | "pendingMeshReceiverFrontier"
    | "committedMeshReceiverFrontier"
    | "committedMeshCasterFrontier"
    | "shadowView"
    | "shadowSelectionEnabled"
    | "shadowSelectionNeedsTraversal"
    | "tiles"
    | "effectiveErrorTarget"
    | "shadowRegionRevisions"
    | "requestedErrorTarget"
    | "runtimeVisible"
    | "disposed"
    | "shadowRegionTransform"
    | "shadowRegionWorldBounds"
    | "sunwardDirection"
    | "options"
    | "tileBoundsTransform"
    | "rootWorldBoundingBox"
    | "shadowReceiverMatch"
    | "tilesetUrl"
    | "viewFrustumsReady"
    | "tilesToShadowView"
    | "tileBoundingBox"
    | "sourceWorldBoundsTransform"
    | "sourceWorldBoundingBox"
    | "shadowViewSignature"
    | "displayedMeshFrontier"
    | "cameraSet"
    | "shadowSignatureDirection"
    | "meshDemandSweepPending"
  >,
  dependencies: Pick<
    ThreeTilesRuntimeServices,
    | "isTileInMainView"
    | "isChildUnloadable"
    | "updateRootWorldBounds"
    | "getTileScreenError"
    | "getStableTileId"
    | "getTileCenterness"
    | "getTileDebugId"
    | "requestRender"
    | "isPipelineIdle"
    | "applyRequestConcurrency"
    | "notifyRequestStateChange"
  >
) {
  const clearShadowReceiverSources: ThreeTilesRuntimeServices["clearShadowReceiverSources"] =
    () => {
      runtimeState.shadowReceiverMask = null;
      runtimeState.shadowReceiverMaskConverged = false;
      runtimeState.shadowReceiverSourceSignature = "";
      runtimeState.mainViewSourceTiles.clear();
      runtimeState.shadowSelectionRefreshPending = false;
      runtimeState.pendingMeshReceiverFrontier = null;
      runtimeState.committedMeshReceiverFrontier.clear();
      runtimeState.committedMeshCasterFrontier.clear();
    };

  const setShadowSelectionEnabled: ThreeTilesRuntimeServices["setShadowSelectionEnabled"] =
    (enabled: boolean) => {
      const nextEnabled = enabled && runtimeState.shadowView !== null;
      if (!nextEnabled) clearShadowReceiverSources();
      if (runtimeState.shadowSelectionEnabled === nextEnabled) return;
      runtimeState.shadowSelectionEnabled = nextEnabled;
      runtimeState.shadowSelectionNeedsTraversal = nextEnabled;
    };

  const requestShadowSelectionRefresh: ThreeTilesRuntimeServices["requestShadowSelectionRefresh"] =
    () => {
      if (!runtimeState.shadowView) return;
      runtimeState.shadowSelectionRefreshPending = true;
    };

  const currentShadowPathConverged: ThreeTilesRuntimeServices["currentShadowPathConverged"] =
    () => {
      if (!runtimeState.tiles || !runtimeState.shadowReceiverMask) return false;
      let currentTileCount = 0;
      for (const visible of runtimeState.tiles.visibleTiles) {
        const tile = visible as RuntimeTile;
        if (
          tile.shadowReceiverCurrent !== true ||
          dependencies.isTileInMainView(tile)
        ) {
          continue;
        }
        currentTileCount += 1;
        const children = (tile.children ?? []) as RuntimeTile[];
        if (children.length === 0 || tile.traversal?.unconditionallyRefine) {
          continue;
        }
        if (tile.traversal.error <= runtimeState.effectiveErrorTarget) continue;
        if (!children.every(dependencies.isChildUnloadable)) return false;
      }
      return currentTileCount > 0;
    };

  const shadowRegionKey: ThreeTilesRuntimeServices["shadowRegionKey"] = (
    bounds: THREE.Box3,
    errorPixels: number,
    receiverBounds?: THREE.Box3
  ) =>
    [
      ...bounds.min.toArray(),
      ...bounds.max.toArray(),
      errorPixels,
      ...(receiverBounds
        ? [...receiverBounds.min.toArray(), ...receiverBounds.max.toArray()]
        : []),
    ].join(",");

  const invalidateShadowRegionRevisions: ThreeTilesRuntimeServices["invalidateShadowRegionRevisions"] =
    (changedBounds?: readonly THREE.Box3[]) => {
      if (changedBounds === undefined) {
        runtimeState.shadowRegionRevisions.clear();
        return;
      }
      if (changedBounds.length === 0) return;
      for (const [key, entry] of runtimeState.shadowRegionRevisions) {
        if (
          changedBounds.some((bounds) =>
            entry.queryBounds.intersectsBox(bounds)
          )
        ) {
          runtimeState.shadowRegionRevisions.delete(key);
        }
      }
    };

  const getShadowRegionRevision: ThreeTilesRuntimeServices["getShadowRegionRevision"] =
    (
      bounds: THREE.Box3,
      errorPixels = runtimeState.requestedErrorTarget,
      receiverBounds?: THREE.Box3
    ): string | null => {
      if (
        !runtimeState.tiles ||
        !runtimeState.runtimeVisible ||
        runtimeState.disposed ||
        !runtimeState.shadowReceiverMask ||
        !runtimeState.tiles.rootTileset?.root
      )
        return null;
      // A pending traversal elsewhere is not missing coverage in this committed
      // region. View/model changes invalidate the memo; the regional hierarchy
      // proof below decides readiness, not global loading/refresh flags.
      runtimeState.tiles.group.updateWorldMatrix(true, false);
      if (
        !runtimeState.shadowRegionTransform.equals(
          runtimeState.tiles.group.matrixWorld
        )
      ) {
        runtimeState.shadowRegionTransform.copy(
          runtimeState.tiles.group.matrixWorld
        );
        runtimeState.shadowRegionWorldBounds = new WeakMap();
        runtimeState.shadowRegionRevisions.clear();
      }
      const key = shadowRegionKey(bounds, errorPixels, receiverBounds);
      if (runtimeState.shadowRegionRevisions.has(key))
        return runtimeState.shadowRegionRevisions.get(key)!.revision;
      const worldBounds = new THREE.Box3();
      let regionMask: ShadowReceiverMask | null = null;
      if (
        receiverBounds &&
        runtimeState.shadowView &&
        dependencies.updateRootWorldBounds()
      ) {
        runtimeState.shadowView.camera.updateMatrixWorld(true);
        runtimeState.shadowView.camera
          .getWorldDirection(runtimeState.sunwardDirection)
          .negate()
          .normalize();
        const regionalReceivers: ShadowReceiverSource[] = [];
        const receiverFrontier = runtimeState.options.providesTerrain
          ? runtimeState.committedMeshReceiverFrontier
          : runtimeState.tiles.visibleTiles;
        for (const receiver of receiverFrontier) {
          const volume = (receiver as RuntimeTile).engineData?.boundingVolume;
          if (!volume?.getAABB) continue;
          readOrientedTileBounds(
            volume,
            worldBounds,
            runtimeState.tileBoundsTransform
          );
          runtimeState.tileBoundsTransform.premultiply(
            runtimeState.tiles.group.matrixWorld
          );
          worldBounds.applyMatrix4(runtimeState.tileBoundsTransform);
          if (!worldBounds.intersectsBox(receiverBounds)) continue;
          const clippedBounds = worldBounds.clone().intersect(receiverBounds);
          regionalReceivers.push({
            bounds: clippedBounds,
            geometricError: receiver.geometricError,
            screenErrorPixels: dependencies.getTileScreenError(
              receiver as RuntimeTile
            ),
            centerness: 1,
            maximumCasterDistance: maximumSweepDistanceWithinBox(
              clippedBounds,
              runtimeState.rootWorldBoundingBox,
              runtimeState.sunwardDirection
            ),
          });
        }
        regionMask = createShadowReceiverMask(
          regionalReceivers,
          runtimeState.shadowView.camera.matrixWorldInverse,
          runtimeState.shadowView.casterAngularRadiusRadians
        );
        if (!regionMask) return null;
      }
      let visitedNodes = 0;
      let broadPhaseNodes = 0;
      let rejectedPrismNodes = 0;
      const cut = getReadyMeshRegionCut(
        runtimeState.tiles.rootTileset.root,
        runtimeState.tiles.visibleTiles,
        errorPixels,
        (entry) => {
          visitedNodes += 1;
          const tile = entry as RuntimeTile;
          const volume = tile.engineData?.boundingVolume;
          if (!volume?.getAABB)
            return { intersects: true, errorPixels: Number.POSITIVE_INFINITY };
          let cachedBounds = runtimeState.shadowRegionWorldBounds.get(tile);
          if (!cachedBounds) {
            const box = new THREE.Box3();
            const transform = new THREE.Matrix4();
            readOrientedTileBounds(volume, box, transform);
            transform.premultiply(runtimeState.tiles!.group.matrixWorld);
            cachedBounds = {
              box,
              transform,
              worldBounds: box.clone().applyMatrix4(transform),
            };
            runtimeState.shadowRegionWorldBounds.set(tile, cachedBounds);
          }
          let intersects = cachedBounds.worldBounds.intersectsBox(bounds);
          if (intersects && runtimeState.shadowReceiverMask) {
            // Regional receiver AABBs are only a query envelope. They must not
            // invent demand outside the native-volume union used by loading.
            readOrientedTileBounds(
              volume,
              runtimeState.tileBoundingBox,
              runtimeState.tileBoundsTransform
            );
            intersects = runtimeState.shadowReceiverMask.match(
              runtimeState.tileBoundingBox,
              runtimeState.shadowReceiverMatch,
              runtimeState.tileBoundsTransform,
              { key: tile, parent: tile.parent ?? undefined }
            );
          }
          if (intersects) {
            broadPhaseNodes += 1;
            if (
              regionMask &&
              !regionMask.match(
                cachedBounds.box,
                runtimeState.shadowReceiverMatch,
                cachedBounds.transform,
                { key: tile, parent: tile.parent ?? undefined }
              )
            ) {
              intersects = false;
              rejectedPrismNodes += 1;
            }
          }
          return {
            intersects,
            errorPixels: !intersects
              ? 0
              : regionMask
              ? receiverMatchedTileError(
                  tile.geometricError,
                  runtimeState.shadowReceiverMatch.receiverGeometricError,
                  errorPixels,
                  runtimeState.shadowReceiverMatch.receiverPixelsPerMeter
                )
              : dependencies.getTileScreenError(tile),
          };
        }
      );
      // Cache identities describe the source, transform and complete published
      // cut, not a session counter. URL versions remain the source's authority
      // for remotely changed payloads; this cache never persists raw GPU targets.
      const revision =
        cut === null
          ? null
          : JSON.stringify([
              runtimeState.tilesetUrl,
              runtimeState.tiles.group.matrixWorld.elements,
              errorPixels,
              cut
                .map((tile) => [
                  dependencies.getStableTileId(tile),
                  tile.geometricError,
                ])
                .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
            ]);
      if (runtimeState.shadowRegionRevisions.size >= 128) {
        const oldestKey = runtimeState.shadowRegionRevisions
          .keys()
          .next().value;
        if (oldestKey !== undefined)
          runtimeState.shadowRegionRevisions.delete(oldestKey);
      }
      runtimeState.shadowRegionRevisions.set(key, {
        revision,
        queryBounds: bounds.clone(),
        diagnostics: {
          sourceId: runtimeState.tilesetUrl,
          ready: revision !== null,
          errorPixels,
          visitedNodes,
          broadPhaseNodes,
          rejectedPrismNodes,
          receiverPrismTested: regionMask !== null,
          selectedTileIds: cut?.map(dependencies.getStableTileId) ?? [],
        },
      });
      return revision;
    };

  const peekShadowRegionRevision: ThreeTilesRuntimeServices["peekShadowRegionRevision"] =
    (bounds: THREE.Box3, errorPixels: number, receiverBounds?: THREE.Box3) =>
      runtimeState.shadowRegionRevisions.get(
        shadowRegionKey(bounds, errorPixels, receiverBounds)
      )?.revision ?? null;

  const getTileLoadReason: ThreeTilesRuntimeServices["getTileLoadReason"] = (
    tile: RuntimeTile
  ): SharedThreeSceneTileVolume["loadReason"] => {
    if (runtimeState.options.providesTerrain && runtimeState.shadowView) {
      return runtimeState.committedMeshReceiverFrontier.has(tile)
        ? "viewport"
        : "shadow";
    }
    if (dependencies.isTileInMainView(tile)) return "viewport";
    return tile.shadowReceiverCenterness === undefined ? undefined : "shadow";
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
      if (!dependencies.updateRootWorldBounds()) return null;
      sourceCamera
        .getWorldDirection(runtimeState.sunwardDirection)
        .negate()
        .normalize();
      runtimeState.tilesToShadowView.multiplyMatrices(
        sourceCamera.matrixWorldInverse,
        runtimeState.tiles.group.matrixWorld
      );
      const receivers = [...frontier]
        .filter((tile) => dependencies.isTileInMainView(tile as RuntimeTile))
        .map((tile) => ({
          tile: tile as RuntimeTile,
          screenErrorPixels: dependencies.getTileScreenError(
            tile as RuntimeTile
          ),
        }));
      const signature = JSON.stringify([
        runtimeState.shadowViewSignature,
        runtimeState.requestedErrorTarget,
        runtimeState.tilesToShadowView.elements,
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
            runtimeState.tiles.group.matrixWorld,
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
            casterGeometricError:
              screenErrorPixels > 0 && Number.isFinite(screenErrorPixels)
                ? (tile.geometricError *
                    meshShadowStageError(
                      screenErrorPixels,
                      runtimeState.requestedErrorTarget
                    )) /
                  screenErrorPixels
                : tile.geometricError,
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
          sources,
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
      const receiverFrontier =
        runtimeState.committedMeshReceiverFrontier.size > 0
          ? runtimeState.committedMeshReceiverFrontier
          : runtimeState.displayedMeshFrontier;
      const snapshot = createReceiverSnapshot(receiverFrontier);
      if (!snapshot?.mask) return "empty" as const;
      const {
        signature: nextSignature,
        mask: nextMask,
        sourceTiles,
      } = snapshot;
      if (
        runtimeState.shadowReceiverMask &&
        nextSignature === runtimeState.shadowReceiverSourceSignature
      ) {
        return "unchanged" as const;
      }
      // There is one current union: viewport receivers plus their sunward
      // corridor. Keeping the previous mask alive would retain and request tiles
      // that belong to neither after a view change.
      runtimeState.shadowReceiverMask = nextMask;
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
        runtimeState.tiles.group.children.length === 0
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
        setShadowSelectionEnabled(true);
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
        !currentShadowPathConverged()
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
      runtimeState.committedMeshReceiverFrontier = new Set(
        runtimeState.pendingMeshReceiverFrontier
      );
      maybeEnableShadowSelection();

      // Upstream visibleTiles can withhold an already decoded caster behind
      // unrelated REPLACE siblings. Membership comes from resident metadata;
      // the local family refinement below still prevents parent/child hybrids.
      // A tile may be both a receiver and a caster; Set union keeps it once.
      const residentTiles =
        (runtimeState.tiles.lruCache as RuntimeLruCache | undefined)
          ?.itemList ?? [];
      const proposed = new Set(
        [
          ...new Set([...traversalTiles, ...previousCasters, ...residentTiles]),
        ].filter((tile) => {
          const runtimeTile = tile as RuntimeTile;
          // The receiver cut exclusively owns observer-visible coverage.
          // Re-introducing upstream's partial parent/child traversal here made
          // coarse REPLACE ancestors bleed through their detailed children.
          if (dependencies.isTileInMainView(runtimeTile))
            return runtimeState.committedMeshReceiverFrontier.has(tile);
          if (
            !runtimeTile.engineData?.scene &&
            tile.internal?.loadingState !== 4
          )
            return false;
          const volume = runtimeTile.engineData?.boundingVolume;
          if (!volume?.getAABB || !runtimeState.shadowReceiverMask)
            return false;
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
      const casterCut = refineLoadedMeshFrontier(
        proposed,
        runtimeState.effectiveErrorTarget,
        (tile) => {
          if (dependencies.isTileInMainView(tile as RuntimeTile)) return true;
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
        (tile) => dependencies.getTileScreenError(tile as RuntimeTile)
      );
      // The main-camera receiver frontier still owns its own atomic families.
      for (const tile of casterCut) {
        if (
          dependencies.isTileInMainView(tile as RuntimeTile) &&
          !runtimeState.committedMeshReceiverFrontier.has(tile)
        )
          casterCut.delete(tile);
      }
      for (const tile of runtimeState.committedMeshReceiverFrontier)
        casterCut.add(tile);
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
          transform.premultiply(runtimeState.tiles.group.matrixWorld);
          changedBounds.push(bounds.applyMatrix4(transform));
        }
        invalidateShadowRegionRevisions(
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
      runtimeState.pendingMeshReceiverFrontier = null;
    };

  const setShadowView: ThreeTilesRuntimeServices["setShadowView"] = (view) => {
    // Caster membership for a receiver tile depends on sun direction, not
    // observer position, shadow buffer dimensions or a translated light
    // camera. Keep the existing union and its regional proofs across pans.
    // Exact direction changes still invalidate and rebuild it.
    view?.camera.updateMatrixWorld(true);
    const nextSignature = view
      ? view.camera
          .getWorldDirection(runtimeState.shadowSignatureDirection)
          .normalize()
          .toArray()
          .map((component) => component.toFixed(7))
          .concat(String(view.casterAngularRadiusRadians ?? 0))
          .join(",")
      : "";
    runtimeState.shadowView = view;
    if (nextSignature === runtimeState.shadowViewSignature) return;
    runtimeState.shadowViewSignature = nextSignature;
    runtimeState.shadowRegionRevisions.clear();
    // Reconcile pending caster downloads against the NEW corridor mask in the
    // existing bounded sweep. Never evict visible receivers on a solar change.
    runtimeState.meshDemandSweepPending = true;
    if (view) {
      requestShadowSelectionRefresh();
    } else {
      setShadowSelectionEnabled(false);
    }
    dependencies.applyRequestConcurrency();
    runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
    dependencies.notifyRequestStateChange();
  };

  const isShadowRegionReady: ThreeTilesRuntimeServices["isShadowRegionReady"] =
    (bounds, errorPixels, receiverBounds) =>
      getShadowRegionRevision(bounds, errorPixels, receiverBounds) !== null;

  const getShadowRegionDiagnostics: ThreeTilesRuntimeServices["getShadowRegionDiagnostics"] =
    (
      bounds,
      errorPixels = runtimeState.requestedErrorTarget,
      receiverBounds
    ) => {
      getShadowRegionRevision(bounds, errorPixels, receiverBounds);
      return (
        runtimeState.shadowRegionRevisions.get(
          shadowRegionKey(bounds, errorPixels, receiverBounds)
        )?.diagnostics ?? null
      );
    };
  return {
    clearShadowReceiverSources,
    setShadowSelectionEnabled,
    requestShadowSelectionRefresh,
    currentShadowPathConverged,
    shadowRegionKey,
    invalidateShadowRegionRevisions,
    getShadowRegionRevision,
    peekShadowRegionRevision,
    getTileLoadReason,
    createReceiverSnapshot,
    captureShadowReceiverSources,
    maybeEnableShadowSelection,
    maybeFinalizeShadowSelection,
    advanceMeshShadowCorridors,
    setShadowView,
    isShadowRegionReady,
    getShadowRegionDiagnostics,
  };
}
