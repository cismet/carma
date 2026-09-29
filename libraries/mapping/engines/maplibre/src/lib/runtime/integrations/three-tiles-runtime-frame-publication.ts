import type { Tile } from "3d-tiles-renderer/core";
import * as THREE from "three";

import { initialMeshLoadError } from "../../core/mesh-error-policy";

import { TILES_LOAD_POLICY } from "../../core/tile-load-config";
import { selectMeshReceiverPlan } from "../../core/mesh-tile-selection";
import {
  collectResidentAncestors,
  getRetainedMeshAncestors,
} from "../../core/mesh-tile-retention";

import type { RuntimeTile } from "./three-tiles-runtime-types";

import { setTileShadowRole } from "./three-tiles-shadow-role";

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
  let publishedMeshFrontier = new Set<Tile>();
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
      const receiverErrorTarget = runtimeState.effectiveErrorTarget;
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
        (tile) => attachment.isDeferredMaterialReady(tile),
        frameState.retainedMeshAncestors,
        {
          published: runtimeState.displayedMeshFrontier,
          // Missing mesh coverage admits the first drawable approximation.
          // Final pixel quality belongs to refinement after that publication.
          allowCoarseBootstrap: true,
          releaseEmptyReplacementRegions: true,
          retainedCasters: runtimeState.shadowView
            ? runtimeState.committedMeshCasterFrontier
            : undefined,
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
        new Set([
          ...receiverPlan.refinementSupport,
          ...runtimeState.meshShadowReserve.support,
        ]),
        receiverPlan.unpreparedParents
      );
      abortStaleDownloads();
      runtimeState.lastLoadedViewportCutSize = loadedViewportCut.size;
      const previousDisplayed = runtimeState.displayedMeshFrontier;
      const nextDisplayed = loadedViewportCut;
      // Demand proofs use frontier identity. Rebuilding the same selection
      // must not invalidate them when no Tile membership changed.
      if (
        nextDisplayed.size !== previousDisplayed.size ||
        [...nextDisplayed].some((tile) => !previousDisplayed.has(tile))
      )
        runtimeState.displayedMeshFrontier = nextDisplayed;
      if (runtimeState.shadowView) {
        dependencies.advanceMeshShadowCorridors(
          runtimeState.displayedMeshFrontier,
          traversalFrontier
        );
        // Selection can run ahead of presentation while a replacement's
        // casters load. Retention and native visibility follow the committed cut.
        runtimeState.displayedMeshFrontier = new Set([
          ...[...runtimeState.displayedMeshFrontier].filter(
            (tile) => !dependencies.isTileInMainView(tile as RuntimeTile)
          ),
          ...runtimeState.committedMeshReceiverFrontier,
        ]);
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
      const mountedModels = new Set(runtimeState.tiles.group.children);
      for (const tile of new Set([
        ...traversalFrontier,
        ...publishedMeshFrontier,
        ...displayed,
      ])) {
        const visible = displayed.has(tile);
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
              ? runtimeState.committedMeshCasterFrontier.has(tile)
              : displayed.has(tile),
          });
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
      publishedMeshFrontier = displayed;
      dependencies.endTileWaitObservation();
      frameState.publishedContentRevision = runtimeState.meshContentRevision;
    }
  };
}
