import * as THREE from "three";

import {
  createShadowReceiverMask,
  maximumSweepDistanceWithinBox,
  receiverMatchedTileError,
  type ShadowReceiverMask,
  type ShadowReceiverSource,
} from "../../core/shadow-receiver-mask";
import {
  snapshotTileCameraViews,
  tileCameraViewsSignature,
  TILE_CAMERA_ROLE,
  TILE_SHADOW_CAMERA_ID,
} from "../../core/tile-camera-demand";
import { readOrientedTileBounds } from "./three-tiles-bounds";
import { getReadyMeshRegionCut } from "../../core/mesh-tile-coverage";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import type { RuntimeTile } from "./three-tiles-runtime-types";
import { createCasterVolumeDemand } from "./three-tiles-runtime-caster-demand";
import { createThreeTilesShadowPublication } from "./three-tiles-runtime-shadow-publication";

export type ThreeTilesShadowsState = Pick<
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
  | "tileCameraDemand"
  | "tileCameraSignature"
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
  | "frameFromTiles"
  | "frameToShadowView"
  | "referenceToCurrent"
  | "currentToReference"
  | "tileBoundingBox"
  | "sourceWorldBoundsTransform"
  | "sourceWorldBoundingBox"
  | "shadowViewSignature"
  | "retainedShadowRequests"
  | "shadowCasterRequests"
  | "pendingShadowView"
  | "meshInitialBasePassDone"
  | "displayedMeshFrontier"
  | "cameraSet"
  | "shadowSignatureDirection"
  | "meshDemandSweepPending"
>;

export function createThreeTilesShadows(
  runtimeState: ThreeTilesShadowsState,
  dependencies: Pick<
    ThreeTilesRuntimeServices,
    | "isTileInMainView"
    | "isChildUnloadable"
    | "updateRootWorldBounds"
    | "updateFrameFromTiles"
    | "getTileScreenError"
    | "getStableTileId"
    | "getTileCenterness"
    | "getTileDebugId"
    | "recordTileWait"
    | "requestRender"
    | "isPipelineIdle"
    | "applyRequestConcurrency"
    | "notifyRequestStateChange"
  >
) {
  const clearShadowReceiverSources: ThreeTilesRuntimeServices["clearShadowReceiverSources"] =
    () => {
      runtimeState.shadowReceiverMask = null;
      runtimeState.shadowCasterRequests.clear();
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
      if (runtimeState.options.providesTerrain)
        return runtimeState.shadowReceiverMaskConverged;
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
      // Regional bounds and proofs live in frame space, which a local-frame
      // refit leaves untouched; only a real placement change resets them.
      const frameFromTiles = dependencies.updateFrameFromTiles();
      if (!runtimeState.shadowRegionTransform.equals(frameFromTiles)) {
        runtimeState.shadowRegionTransform.copy(frameFromTiles);
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
          .transformDirection(runtimeState.currentToReference);
        const regionalReceivers: ShadowReceiverSource[] = [];
        for (const receiver of runtimeState.options.providesTerrain
          ? []
          : runtimeState.shadowView?.terrainReceivers ?? []) {
          const clippedBounds = new THREE.Box3(
            new THREE.Vector3(...receiver.minimum),
            new THREE.Vector3(...receiver.maximum)
          ).intersect(receiverBounds);
          if (clippedBounds.isEmpty()) continue;
          regionalReceivers.push({
            bounds: clippedBounds,
            geometricError: receiver.geometricError ?? 1,
            screenErrorPixels: receiver.errorPixels ?? errorPixels,
            centerness: 1,
            maximumCasterDistance: maximumSweepDistanceWithinBox(
              clippedBounds,
              runtimeState.rootWorldBoundingBox,
              runtimeState.sunwardDirection
            ),
          });
        }
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
            runtimeState.frameFromTiles
          );
          worldBounds.applyMatrix4(runtimeState.tileBoundsTransform);
          if (!worldBounds.intersectsBox(receiverBounds)) continue;
          const clippedBounds = worldBounds.clone().intersect(receiverBounds);
          regionalReceivers.push({
            bounds: clippedBounds,
            geometricError: receiver.geometricError,
            screenErrorPixels: dependencies.getTileScreenError(
              receiver as RuntimeTile,
              false
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
          runtimeState.frameToShadowView.multiplyMatrices(
            runtimeState.shadowView.camera.matrixWorldInverse,
            runtimeState.referenceToCurrent
          ),
          runtimeState.options.providesTerrain
            ? 0
            : runtimeState.shadowView.casterAngularRadiusRadians
        );
        if (!regionMask) return null;
      }
      const lightDemand =
        runtimeState.options.providesTerrain && runtimeState.shadowView
          ? createCasterVolumeDemand(
              runtimeState.shadowReceiverMask,
              errorPixels,
              runtimeState.shadowView,
              runtimeState.tiles.group.matrixWorld
            )
          : undefined;
      let visitedNodes = 0;
      let broadPhaseNodes = 0;
      let rejectedPrismNodes = 0;
      const cut = getReadyMeshRegionCut(
        runtimeState.tiles.rootTileset.root,
        runtimeState.options.providesTerrain
          ? runtimeState.committedMeshCasterFrontier
          : runtimeState.tiles.visibleTiles,
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
            transform.premultiply(runtimeState.frameFromTiles);
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
          const caster = intersects ? lightDemand?.(tile) : undefined;
          // Region capture follows the same parallel-ray membership as requests.
          if (caster) intersects = caster.intersects;
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
            // The shared mesh cut already enforces exclusive replacement.
            // Capture coarse coverage now and refresh when its family refines.
            errorPixels:
              !intersects ||
              runtimeState.options.providesTerrain ||
              runtimeState.committedMeshReceiverFrontier.has(tile)
                ? 0
                : caster
                ? caster.errorPixels
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
              runtimeState.frameFromTiles.elements,
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

  const {
    getTileLoadReason,
    createReceiverSnapshot,
    captureShadowReceiverSources,
    maybeEnableShadowSelection,
    maybeFinalizeShadowSelection,
    advanceMeshShadowCorridors,
  } = createThreeTilesShadowPublication(runtimeState, {
    ...dependencies,
    setShadowSelectionEnabled,
    currentShadowPathConverged,
    invalidateShadowRegionRevisions,
  });

  let regionalCameraSignature = "";
  const applyShadowView = (
    view: Parameters<ThreeTilesRuntimeServices["setShadowView"]>[0]
  ) => {
    // Keep receiver-mask lifecycle keyed by sun direction. Regional proofs
    // also depend on the light volume and logical sampling grid, independently
    // of pending requests retained across solar changes.
    view?.camera.updateMatrixWorld(true);
    const nextRegionalCameraSignature =
      view && runtimeState.options.providesTerrain
        ? tileCameraViewsSignature(
            snapshotTileCameraViews([
              {
                id: TILE_SHADOW_CAMERA_ID,
                camera: view.camera,
                viewport: [view.shadowMapSize.width, view.shadowMapSize.height],
                errorTargetPixels: 1,
                role: TILE_CAMERA_ROLE.GEOMETRY,
              },
            ]).map((snapshot) => ({
              ...snapshot,
              // Proofs live in frame space; a local scene refit alone must not
              // change their camera identity. Query error is already in the key.
              matrixWorld: new THREE.Matrix4()
                .fromArray(snapshot.matrixWorld)
                .premultiply(runtimeState.currentToReference)
                .toArray(),
            }))
          )
        : "";
    if (nextRegionalCameraSignature !== regionalCameraSignature) {
      runtimeState.shadowRegionRevisions.clear();
      regionalCameraSignature = nextRegionalCameraSignature;
    }
    // The ECEF direction is the sun itself. The scene direction also turns
    // with the local frame the light is mounted on, so it would invalidate the
    // union on every refit although no caster changed.
    const nextSignature = view
      ? (view.directionToSunECEF
          ? [...view.directionToSunECEF]
          : view.camera
              .getWorldDirection(runtimeState.shadowSignatureDirection)
              .normalize()
              .toArray()
        )
          .map((component) => component.toFixed(7))
          .concat(String(view.casterAngularRadiusRadians ?? 0))
          .join(",")
      : "";
    if (view && !runtimeState.shadowView) {
      runtimeState.committedMeshReceiverFrontier = new Set(
        runtimeState.displayedMeshFrontier
      );
      runtimeState.committedMeshCasterFrontier = new Set(
        runtimeState.displayedMeshFrontier
      );
    }
    runtimeState.shadowView = view;
    if (nextSignature === runtimeState.shadowViewSignature) return;
    // Solar animation revisits these directions. Invalidate the geometric
    // proof immediately, but let existing jobs populate the bounded cache.
    // This is request retention, never permission to draw obsolete casters.
    if (view && runtimeState.shadowViewSignature) {
      for (const tile of runtimeState.tiles?.loadingTiles ?? [])
        runtimeState.retainedShadowRequests.add(tile);
    } else {
      runtimeState.retainedShadowRequests.clear();
    }
    runtimeState.shadowViewSignature = nextSignature;
    runtimeState.shadowRegionRevisions.clear();
    // Reconcile presentation against the new mask; retained jobs use spare
    // capacity after current demand. Camera changes release that retention.
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

  const applyPendingShadowView: ThreeTilesRuntimeServices["applyPendingShadowView"] =
    () => {
      if (runtimeState.pendingShadowView === runtimeState.shadowView) return;
      applyShadowView(runtimeState.pendingShadowView);
    };
  const setShadowView: ThreeTilesRuntimeServices["setShadowView"] = (view) => {
    runtimeState.pendingShadowView = view;
    applyShadowView(view);
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
    applyPendingShadowView,
    isShadowRegionReady,
    getShadowRegionDiagnostics,
  };
}
