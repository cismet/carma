import type { Tile } from "3d-tiles-renderer/core";
import * as THREE from "three";

import {
  idleRingAllowedError,
  initialMeshLoadError,
} from "../../core/mesh-error-policy";

import { TILES_LOAD_POLICY } from "../../core/tile-load-config";
import { selectMeshReceiverPlan } from "../../core/mesh-tile-selection";
import {
  collectResidentAncestors,
  getRetainedMeshAncestors,
  retainMeshDetailFrontier,
} from "../../core/mesh-tile-retention";
import { selectMeshUnderlayParents } from "../../core/mesh-tile-underlay";

import type { RuntimeTile } from "./three-tiles-runtime-types";

import {
  setTileDepthUnderlay,
  setTileShadowRole,
} from "./three-tiles-shadow-role";

import type {
  ThreeTilesFrameRuntimeState,
  ThreeTilesFrameDependencies,
  ThreeTilesFrameHooks,
} from "./three-tiles-runtime-frame-types";

/** Apply the pure receiver/caster plans to native visibility and materials. */
export function createThreeTilesFramePublication(
  runtimeState: ThreeTilesFrameRuntimeState,
  dependencies: ThreeTilesFrameDependencies,
  hooks: ThreeTilesFrameHooks
) {
  const { frameState, attachment, abortStaleDownloads, isTileInAnyView } =
    hooks;
  let publishedNativeFrontier = new Set<Tile>();
  return ({
    previousTraversal,
    retainedDetailErrorTarget,
    allowInViewCoarsening,
    completingShadowTraversal,
    inReceiverView,
  }: {
    previousTraversal: number;
    retainedDetailErrorTarget: number;
    allowInViewCoarsening: boolean;
    completingShadowTraversal: boolean;
    inReceiverView: (tile: Tile) => boolean;
  }) => {
    if (!runtimeState.tiles) return;
    // Snapshot the native cut before adding retained/offscreen coverage.
    const traversalFrontier = new Set(runtimeState.tiles.visibleTiles);
    if (
      runtimeState.options.providesTerrain &&
      runtimeState.displayedMeshFrontier.size === 0
    ) {
      // Bootstrap is a request ceiling, not permission to discard a finer
      // complete cut that native traversal already has ready for first draw.
      frameState.retainedMeshAncestors = getRetainedMeshAncestors(
        traversalFrontier,
        retainedDetailErrorTarget,
        isTileInAnyView,
        dependencies.getTileScreenError,
        allowInViewCoarsening
      );
    }
    // View changes do not invalidate sun corridors; content changes invalidate
    // intersecting regions, while placement/sun changes invalidate all.
    if (runtimeState.tiles.frameCount !== previousTraversal)
      runtimeState.mainViewIntersectionCache = new WeakMap();
    if (!runtimeState.options.providesTerrain) {
      const changedBounds: THREE.Box3[] = [];
      let unknownBounds = false;
      for (const tile of new Set([
        ...publishedNativeFrontier,
        ...traversalFrontier,
      ])) {
        if (publishedNativeFrontier.has(tile) === traversalFrontier.has(tile))
          continue;
        const model = (tile as RuntimeTile).engineData?.scene;
        const bounds =
          model && dependencies.readModelFrameBounds(model, new THREE.Box3());
        if (bounds && !bounds.isEmpty()) changedBounds.push(bounds);
        else unknownBounds = true;
      }
      if (unknownBounds || changedBounds.length) {
        // Loaded payloads can become visible without another load-model event.
        // Recheck only changed corridors when the native published cut changes.
        dependencies.invalidateShadowRegionRevisions(
          unknownBounds ? undefined : changedBounds
        );
        runtimeState.options.onContentChanged?.(
          unknownBounds ? undefined : changedBounds
        );
      }
      publishedNativeFrontier = traversalFrontier;
      // LOD2 receiver/caster roles follow the observer, not the sun camera.
      for (const tile of traversalFrontier) {
        const model = (tile as RuntimeTile).engineData?.scene;
        if (model)
          setTileShadowRole(model, {
            receiver: dependencies.isTileInMainView(tile as RuntimeTile),
            caster: true,
          });
      }
    }
    if (
      runtimeState.options.providesTerrain &&
      runtimeState.tiles.rootTileset?.root &&
      (runtimeState.meshContentRevision !==
        frameState.publishedContentRevision ||
        runtimeState.tiles.frameCount !== previousTraversal ||
        runtimeState.mainViewProjectionChanged ||
        completingShadowTraversal)
    ) {
      dependencies.beginTileWaitObservation();
      // Multi-camera screen errors are demand ratios normalized to the
      // effective target. Comparing them to the raw requested target would
      // refine again by the staging factor and churn the resident cut.
      const receiverErrorTarget =
        runtimeState.options.handoverErrorTargetPixels === undefined &&
        runtimeState.shadowView &&
        runtimeState.tileCameraDemand.views.length <= 1
          ? Math.max(
              runtimeState.requestedErrorTarget,
              runtimeState.memoryErrorTarget
            )
          : runtimeState.effectiveErrorTarget;
      const receiverPlan = selectMeshReceiverPlan(
        runtimeState.tiles.rootTileset.root,
        runtimeState.meshCoverageRecovery
          ? Math.max(
              receiverErrorTarget,
              runtimeState.options.firstImageErrorTargetPixels ??
                TILES_LOAD_POLICY.firstImageMaxErrorPixels
            )
          : receiverErrorTarget,
        runtimeState.shadowView
          ? Number.POSITIVE_INFINITY
          : Math.max(
              initialMeshLoadError(
                runtimeState.requestedErrorTarget,
                runtimeState.options.baseErrorTargetPixels
              ),
              runtimeState.memoryErrorTarget
            ),
        inReceiverView,
        dependencies.getTileScreenError,
        (tile) =>
          (!dependencies.isTileInMainView(tile as RuntimeTile) &&
            !dependencies.getTileCameraDemand(tile as RuntimeTile).receiver) ||
          attachment.isDeferredMaterialReady(tile),
        frameState.retainedMeshAncestors,
        {
          published: runtimeState.displayedMeshFrontier,
          // Hard shadows use the currently committed LOD. Only coverage,
          // not first-image pixel error, is a prerequisite for that draw.
          allowCoarseBootstrap: runtimeState.pendingShadowView !== null,
          firstImageErrorTargetPixels:
            runtimeState.options.firstImageErrorTargetPixels,
        }
      );
      const loadedViewportCut = receiverPlan.tiles;
      if (
        runtimeState.options.diagnostics &&
        runtimeState.options.tileTelemetry !== false
      )
        for (const tile of receiverPlan.materialWaits)
          dependencies.recordTileWait(tile, "receiver", "material");
      attachment.updateMeshRefinementSupport(
        receiverPlan.refinementSupport,
        receiverPlan.unpreparedParents
      );
      abortStaleDownloads();
      runtimeState.lastLoadedViewportCutSize = loadedViewportCut.size;
      runtimeState.displayedMeshFrontier = retainMeshDetailFrontier({
        previous: runtimeState.displayedMeshFrontier,
        proposed: loadedViewportCut,
        requestedError: runtimeState.shadowView
          ? receiverErrorTarget
          : retainedDetailErrorTarget,
        inView: inReceiverView,
        allowInViewCoarsening,
        errorPixels: dependencies.getTileScreenError,
        acceptsOffscreenFallback: runtimeState.shadowView
          ? undefined
          : (tile) => {
              if (!attachment.isDeferredMaterialReady(tile)) return false;
              // Reuse reserve demand for coarsening as well as loading. A
              // nearby offscreen branch must not jump straight to the root.
              // These bands select tree levels, not independent ring meshes.
              if (
                runtimeState.extentGeometricError > 0 &&
                tile.children.some(
                  (child) =>
                    child.geometricError >= runtimeState.extentGeometricError
                )
              )
                return false;
              const band = dependencies.getTileRingIndex(tile as RuntimeTile);
              if (
                band <= 0 ||
                !(tile as RuntimeTile).engineData?.boundingVolume
              )
                return false;
              const projected = {
                inView: false,
                error: Infinity,
                distanceFromCamera: Infinity,
              };
              // Outside demand frustums the clipped error is undefined. The
              // vendor's camera metric is used ONLY for this background cut.
              runtimeState.tiles!.calculateTileViewError(tile, projected);
              return (
                projected.error <=
                idleRingAllowedError(
                  initialMeshLoadError(
                    runtimeState.requestedErrorTarget,
                    runtimeState.options.baseErrorTargetPixels
                  ),
                  band,
                  runtimeState.ringRefinePasses,
                  runtimeState.requestedErrorTarget
                )
              );
            },
      });
      if (runtimeState.shadowView) {
        dependencies.advanceMeshShadowCorridors(
          runtimeState.displayedMeshFrontier,
          traversalFrontier
        );
        runtimeState.displayedMeshFrontier = new Set(
          runtimeState.committedMeshReceiverFrontier
        );
      }
      runtimeState.residentAncestors = collectResidentAncestors(
        runtimeState.displayedMeshFrontier,
        runtimeState.extentGeometricError
      );
      const displayed = runtimeState.shadowView
        ? new Set([
            ...runtimeState.committedMeshReceiverFrontier,
            ...runtimeState.committedMeshCasterFrontier,
            ...[...runtimeState.displayedMeshFrontier].filter(
              (tile) =>
                dependencies.getTileCameraDemand(tile as RuntimeTile).required
            ),
          ])
        : new Set(runtimeState.displayedMeshFrontier);
      // Decision: ../../../../TILES_COVERAGE.md#progressive-receiver-overlays
      // Ready children improve colour immediately. Parents fill uncovered
      // regions without depth writes; the shadow caster cut stays separate.
      const previousUnderlay = runtimeState.meshUnderlayFrontier;
      runtimeState.meshUnderlayFrontier = selectMeshUnderlayParents(
        displayed,
        inReceiverView,
        (tile) => attachment.isDeferredMaterialReady(tile)
      );
      const underlay = runtimeState.meshUnderlayFrontier;
      const mountedModels = new Set(runtimeState.tiles.group.children);
      for (const tile of new Set([
        ...traversalFrontier,
        ...displayed,
        ...underlay,
        ...previousUnderlay,
      ])) {
        // Progressive publication without fades; preserve layer opacity.
        const isUnderlay = underlay.has(tile);
        const visible = displayed.has(tile) || isUnderlay;
        const model = (tile as RuntimeTile).engineData?.scene;
        if (
          visible &&
          runtimeState.options.diagnostics &&
          runtimeState.options.tileTelemetry !== false
        ) {
          const progress = dependencies.getTileDebugProgress(tile);
          const receiver = !runtimeState.shadowView
            ? dependencies.isTileInMainView(tile as RuntimeTile)
            : runtimeState.committedMeshReceiverFrontier.has(tile);
          if (receiver)
            dependencies.recordTileWait(
              tile,
              "receiver",
              progress.visibleAt === undefined ? "render" : null
            );
          if (
            runtimeState.shadowView &&
            runtimeState.committedMeshCasterFrontier.has(tile)
          )
            dependencies.recordTileWait(
              tile,
              "shadow",
              progress.shadowPresentedAt !== undefined
                ? null
                : progress.shadowDepthSubmittedAt === undefined
                ? "shadow-render"
                : "shadow-accumulation"
            );
        }
        if (model) {
          // The receiver flag also gates colour and depth writes, so a mesh
          // tile outside the corridor's committed cut would draw its plain
          // surface over the corridor's shadowed pass. A terrain-providing
          // runtime therefore keeps the corridor's own receiver and caster
          // sets while a shadow view is active; every other runtime, LoD2
          // among them, simply shows and receives what the view draws.
          const corridorOwned =
            runtimeState.shadowView !== null &&
            runtimeState.options.providesTerrain;
          setTileShadowRole(model, {
            receiver: corridorOwned
              ? runtimeState.committedMeshReceiverFrontier.has(tile)
              : visible && dependencies.isTileInMainView(tile as RuntimeTile),
            caster: corridorOwned
              ? runtimeState.committedMeshCasterFrontier.has(tile) ||
                dependencies.getTileCameraDemand(tile as RuntimeTile).required
              : displayed.has(tile),
          });
          let depth = 0;
          if (isUnderlay)
            for (let parent = tile.parent; parent; parent = parent.parent)
              depth++;
          setTileDepthUnderlay(model, isUnderlay, -1 / (depth + 1));
        }
        // Decision: MESH-PUBLICATION-REPAIR-20260916 in TILES_COVERAGE.md.
        // Active-only models may have group as parent WITHOUT being children.
        // A visibility-set entry alone must not suppress reattachment on pan.
        if (visible) {
          runtimeState.tiles.markTileUsed(tile);
        }
        const mounted =
          !!model &&
          model.parent === runtimeState.tiles.group &&
          mountedModels.has(model);
        if (
          visible === runtimeState.tiles.visibleTiles.has(tile) &&
          (!visible || (mounted && runtimeState.tiles.activeTiles.has(tile)))
        )
          continue;
        runtimeState.tiles.setTileActive(tile, visible);
        runtimeState.tiles.setTileVisible(tile, visible);
        const traversal = (tile as RuntimeTile).traversal;
        traversal.active = visible;
        traversal.visible = visible;
        traversal.wasSetActive = visible;
        traversal.wasSetVisible = visible;
      }
      dependencies.endTileWaitObservation();
      frameState.publishedContentRevision = runtimeState.meshContentRevision;
    }
  };
}
