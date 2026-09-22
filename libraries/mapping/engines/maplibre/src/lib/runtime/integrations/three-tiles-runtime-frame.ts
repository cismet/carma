import type { Tile } from "3d-tiles-renderer/core";
import * as THREE from "three";

import { getCameraLocalMercatorFit } from "@carma-geo/proj";

import type { SharedThreeSceneFrame } from "../../core/shared-three-scene-types";
import {
  createTileCameraDemand,
  snapshotTileCameraViews,
  TILE_CAMERA_ROLE,
  TILE_MAIN_OBSERVER_ID,
  tileCameraViewsSignature,
} from "../../core/tile-camera-demand";
import type { createTileDrawObserver } from "./three-tiles-draw-observer";
import {
  idleRingAllowedError,
  initialMeshLoadError,
  TILE_MEMORY_ALLOCATION_ERROR,
} from "./three-tiles-load-policy";
import {
  collectLoadedMeshReceiverCandidates,
  collectResidentAncestors,
  getRetainedMeshAncestors,
  retainMeshDetailFrontier,
} from "./three-tiles-mesh-frontier";
import type { createThreeTilesRuntimeAttachment } from "./three-tiles-runtime-attachment";
import type { createThreeTilesCascade } from "./three-tiles-runtime-cascade";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import type { RuntimeLruCache, RuntimeTile } from "./three-tiles-runtime-types";
import { getThreeTileDiagnosticSteps } from "./three-tiles-diagnostic-steps";
import { resolveTileContentUrl } from "./three-tiles-runtime-vendor";
import {
  setTileDepthUnderlay,
  setTileShadowRole,
} from "./three-tiles-shadow-role";
import {
  createTilesCameraSet,
  resolveTilesViewCamera,
} from "./tiles-camera-set";

export type ThreeTilesFrameState = {
  retainedMeshAncestors: Set<Tile>;
  reportedIncompleteFamilies: WeakSet<Tile>;
  publishedContentRevision: number;
  hasBootstrapPayload: boolean;
  telemetryTiles: Set<Tile>;
  telemetryDropped: number;
};

export function createThreeTilesFrameUpdate(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    | "allocationFailed"
    | "cameraSet"
    | "committedMeshCasterFrontier"
    | "committedMeshReceiverFrontier"
    | "currentToReference"
    | "displayedMeshFrontier"
    | "effectiveErrorTarget"
    | "extentFloorArmed"
    | "extentFloorAuditPending"
    | "extentFloorInView"
    | "extentFloorPending"
    | "extentGeometricError"
    | "lastLoadedViewportCutSize"
    | "lastMainViewConverged"
    | "lastRuntimeDebugAt"
    | "lastTraversalMs"
    | "loadingPaused"
    | "mainViewIntersectionCache"
    | "mainViewProjectionChanged"
    | "map"
    | "memoryAdmissionPaused"
    | "memoryErrorTarget"
    | "meshBaseCoverageReady"
    | "meshInitialHandoverDone"
    | "meshContentRevision"
    | "meshDemandSweepPending"
    | "meshUnderlayFrontier"
    | "motionCoverageDue"
    | "offsetGroup"
    | "options"
    | "orientationGroup"
    | "originLngLat"
    | "pendingShadowView"
    | "queuedThisTraversal"
    | "referenceToCurrent"
    | "requestedErrorTarget"
    | "residentAncestors"
    | "ringRefinePasses"
    | "runtimeVisible"
    | "shadowReceiverMask"
    | "shadowSelectionEnabled"
    | "shadowSelectionNeedsTraversal"
    | "shadowView"
    | "tileBoundsVisible"
    | "tileCameraDemand"
    | "tileCameraSignature"
    | "tileViewProjection"
    | "tiles"
    | "viewQualityAuditPasses"
  >,
  dependencies: Pick<
    ThreeTilesRuntimeServices,
    | "advanceMeshShadowCorridors"
    | "applyEffectiveErrorTarget"
    | "applyErrorTargetPolicy"
    | "applyRequestConcurrency"
    | "applyTilesetMinResolution"
    | "assignTilePriority"
    | "getTileCameraDemand"
    | "getTileDebugProgress"
    | "recordTileWait"
    | "drainTileWaitEvents"
    | "beginTileWaitObservation"
    | "endTileWaitObservation"
    | "getTileRingIndex"
    | "getTileScreenError"
    | "invalidateShadowRegionRevisions"
    | "isTileInMainView"
    | "mainViewConverged"
    | "mainViewWithinErrorFactor"
    | "maybeEnableShadowSelection"
    | "maybeFinalizeShadowSelection"
    | "measureUsedBytesMain"
    | "notifyRequestStateChange"
    | "prepareViewFrustums"
    | "prioritizeQueuedTiles"
    | "readModelFrameBounds"
    | "recordCacheCeilingFailure"
    | "resetDeferredTiles"
    | "runDownloadQueues"
    | "scheduleSettledMeshAudit"
    | "sweepSettledMeshDemand"
    | "syncProjector"
    | "syncTileDebugOverlay"
  >,
  hooks: {
    frameState: ThreeTilesFrameState;
    attachment: ReturnType<typeof createThreeTilesRuntimeAttachment>;
    drawObserver: ReturnType<typeof createTileDrawObserver>;
    motionPrefetch: ReturnType<
      typeof createThreeTilesCascade
    >["motionPrefetch"];
    abortStaleDownloads: () => void;
    refineRingCascade: () => void;
    scheduleCascadeTick: () => void;
    isTileInAnyView: (tile: RuntimeTile) => boolean;
    localTelemetry: boolean;
    telemetryCenter: THREE.Vector3;
    telemetrySphere: THREE.Sphere;
  }
) {
  const {
    frameState,
    attachment,
    drawObserver,
    motionPrefetch,
    abortStaleDownloads,
    refineRingCascade,
    scheduleCascadeTick,
    isTileInAnyView,
    localTelemetry,
    telemetryCenter,
    telemetrySphere,
  } = hooks;
  let publishedNativeFrontier = new Set<Tile>();
  const cameraMount = new THREE.Group();
  cameraMount.matrixAutoUpdate = false;
  const mountAxisFlip = new THREE.Matrix4().makeRotationY(Math.PI);
  /** Anchor of the reference fit the mount was made at; null = never mounted. */
  let mountedReferenceLngLat: readonly [number, number] | null = null;
  const update: ThreeTilesRuntimeServices["update"] = (
    frame: SharedThreeSceneFrame
  ) => {
    drawObserver.beginFrame(frame.renderCamera);
    if (
      !runtimeState.runtimeVisible ||
      !runtimeState.tiles ||
      !runtimeState.map
    )
      return;
    const viewportBootstrap =
      runtimeState.options.providesTerrain === true &&
      !runtimeState.meshInitialHandoverDone;
    const inReceiverView = viewportBootstrap
      ? (tile: RuntimeTile) =>
          !tile.engineData?.boundingVolume ||
          dependencies.isTileInMainView(tile)
      : isTileInAnyView;
    if (runtimeState.options.cameraLocalMount) {
      // The shared scene owns the local frame. The tileset is mounted once, at
      // the frame's reference fit, inside the layer's local-frame group; a
      // refit moves that group and nothing here, so tiles, light and shadows
      // move together. Decision: engines/maplibre/README.md#local-frame-for-ecef-tilesets-sun-and-sky.
      const { localFrame } = frame;
      if (localFrame) {
        runtimeState.referenceToCurrent.copy(localFrame.referenceToCurrent);
        runtimeState.currentToReference.copy(localFrame.currentToReference);
      }
      if (
        localFrame &&
        (mountedReferenceLngLat?.[0] !== localFrame.referenceLngLat[0] ||
          mountedReferenceLngLat?.[1] !== localFrame.referenceLngLat[1])
      ) {
        cameraMount.matrix
          .copy(
            getCameraLocalMercatorFit(
              [runtimeState.originLngLat[0], runtimeState.originLngLat[1]],
              [localFrame.referenceLngLat[0], localFrame.referenceLngLat[1]],
              { correctEllipsoidMetric: true }
            )
          )
          .premultiply(mountAxisFlip)
          .multiply(mountAxisFlip);
        if (cameraMount.parent !== runtimeState.offsetGroup) {
          runtimeState.offsetGroup.add(cameraMount);
          cameraMount.add(runtimeState.tiles.group);
        }
        runtimeState.orientationGroup.updateMatrixWorld(true);
        mountedReferenceLngLat = localFrame.referenceLngLat;
      }
    }
    if (runtimeState.options.providesTerrain)
      // Decision: ../../../../TILES_COVERAGE.md#viewport-only-cold-replacement-families
      // Native ancestor loading implicitly enables offscreen sibling requests.
      // During cold fill the bounded first-image pass supplies the fallback.
      runtimeState.tiles.loadAncestors =
        !viewportBootstrap &&
        (!Number.isFinite(runtimeState.options.baseErrorTargetPixels) ||
          (!runtimeState.shadowView &&
            !frameState.hasBootstrapPayload &&
            !runtimeState.extentFloorArmed &&
            runtimeState.displayedMeshFrontier.size === 0));
    // Ancestor motion admits bounded coverage audits; skip strategy publishes
    // arriving tiles during motion. Both keep the last complete displayed cut.
    if (
      runtimeState.options.providesTerrain &&
      runtimeState.map.isMoving?.() &&
      runtimeState.tiles.loadAncestors &&
      !Number.isFinite(runtimeState.options.baseErrorTargetPixels)
    ) {
      if (!runtimeState.motionCoverageDue) return;
      runtimeState.motionCoverageDue = false;
    }
    dependencies.applyRequestConcurrency();
    dependencies.syncProjector();
    try {
      const viewCamera = resolveTilesViewCamera(
        frame.renderCamera,
        frame.lodCamera
      );
      if (!runtimeState.cameraSet) {
        runtimeState.cameraSet = createTilesCameraSet(
          runtimeState.tiles,
          viewCamera
        );
      }
      const lodViewport = frame.cssViewport ?? frame.viewport;
      runtimeState.cameraSet.update(viewCamera, lodViewport.x, lodViewport.y);
      dependencies.prepareViewFrustums(viewCamera);
      if (runtimeState.mainViewProjectionChanged) {
        dependencies.resetDeferredTiles();
        runtimeState.tiles.dispatchEvent({ type: "needs-update" });
        // A downloaded, parked payload can enter the camera without another
        // download completing. Recheck its native parse queue on that event.
        runtimeState.tiles.parseQueue.scheduleJobRun();
      }
      const demandViews = [
        ...snapshotTileCameraViews([
          {
            id: TILE_MAIN_OBSERVER_ID,
            camera: viewCamera,
            viewport: [lodViewport.x, lodViewport.y],
            // UNIFIED-VISIBLE-SSE-20260916: sharing a pool must preserve each
            // camera's request, including the main observer's requested target.
            errorTargetPixels:
              runtimeState.options.handoverErrorTargetPixels === undefined &&
              frame.tileCameraViews?.length
                ? runtimeState.requestedErrorTarget
                : runtimeState.effectiveErrorTarget,
            role: TILE_CAMERA_ROLE.RECEIVER,
          },
        ]),
        // Scheduling rank must not weaken a camera's requested detail.
        // The strictest normalized demand wins wherever volumes overlap.
        ...(frame.tileCameraViews ?? []),
      ];
      const cameraSignature = tileCameraViewsSignature(demandViews);
      // Relaxed motion/startup targets admit new coverage, not replacements
      // for an already-published idle-quality cut. Multi-camera SSE is a
      // demand ratio scaled by effectiveErrorTarget; its ratio=1 still means
      // each camera's requested quality (including the main idle target).
      const retainedDetailErrorTarget = runtimeState.shadowView
        ? Math.max(
            runtimeState.requestedErrorTarget,
            runtimeState.memoryErrorTarget
          )
        : frame.tileCameraViews?.length
        ? runtimeState.effectiveErrorTarget
        : runtimeState.requestedErrorTarget;
      const tileCamerasChanged =
        cameraSignature !== runtimeState.tileCameraSignature;
      if (tileCamerasChanged) {
        runtimeState.tileCameraSignature = cameraSignature;
        runtimeState.tileCameraDemand = createTileCameraDemand(demandViews);
        runtimeState.mainViewIntersectionCache = new WeakMap();
        runtimeState.meshDemandSweepPending = true;
        dependencies.resetDeferredTiles();
        runtimeState.tiles.dispatchEvent({ type: "needs-update" });
        runtimeState.tiles.parseQueue.scheduleJobRun();
      }
      const cameraWorld = viewCamera.matrixWorld.elements;
      const distanceToViewCenter = Math.hypot(
        cameraWorld[12] - frame.lookTarget.x,
        cameraWorld[13] - frame.lookTarget.y,
        cameraWorld[14] - frame.lookTarget.z
      );
      motionPrefetch.update(
        demandViews[0],
        (2 * distanceToViewCenter) /
          Math.abs(viewCamera.projectionMatrix.elements[0])
      );
      if (runtimeState.options.providesTerrain) {
        frameState.retainedMeshAncestors = getRetainedMeshAncestors(
          runtimeState.displayedMeshFrontier,
          retainedDetailErrorTarget,
          isTileInAnyView,
          dependencies.getTileScreenError
        );
      }
      if (runtimeState.options.providesTerrain)
        attachment.updateDeferredMaterials();
      abortStaleDownloads();
      if (runtimeState.mainViewProjectionChanged)
        runtimeState.meshBaseCoverageReady = false;
      // Refresh both pending jobs AND cached candidates before the upstream
      // admission/eviction sort; a finished old query is not a priority cache.
      if (
        runtimeState.options.providesTerrain &&
        (runtimeState.mainViewProjectionChanged || tileCamerasChanged)
      ) {
        for (const tile of (runtimeState.tiles.lruCache as RuntimeLruCache)
          .itemList)
          dependencies.assignTilePriority(tile as RuntimeTile);
      }
      const completingShadowTraversal =
        runtimeState.shadowSelectionNeedsTraversal;
      runtimeState.queuedThisTraversal.clear();
      const previousTraversal = runtimeState.tiles.frameCount;
      // Bound motion audits so filling new gaps cannot monopolize pointer frames.
      runtimeState.tiles.maxTilesProcessed =
        runtimeState.map.isMoving?.() && runtimeState.tiles.loadAncestors
          ? runtimeState.shadowView
            ? 8
            : 32
          : 64;
      dependencies.applyTilesetMinResolution();
      const traversalStartedAt = performance.now();
      const previousFloorPending = runtimeState.extentFloorPending;
      const previousFloorInView = [...runtimeState.extentFloorInView];
      runtimeState.extentFloorPending = 0;
      runtimeState.extentFloorInView.clear();
      const floorWasArmed = runtimeState.extentFloorArmed;
      runtimeState.tiles.update();
      if (runtimeState.tiles.frameCount === previousTraversal) {
        runtimeState.extentFloorPending = previousFloorPending;
        for (const tile of previousFloorInView)
          runtimeState.extentFloorInView.add(tile);
      }
      if (floorWasArmed && runtimeState.tiles.frameCount !== previousTraversal)
        runtimeState.extentFloorAuditPending = false;
      runtimeState.lastTraversalMs = performance.now() - traversalStartedAt;
      if (runtimeState.map?.isMoving?.())
        for (const tile of runtimeState.tiles.loadingTiles)
          runtimeState.tiles.markTileUsed(tile);
      // Wake parked origins after a current-view audit, within existing limits.
      if (
        !runtimeState.memoryAdmissionPaused &&
        runtimeState.tiles.downloadQueue.maxJobsPerOrigin > 0 &&
        runtimeState.tiles.stats.queued > 0 &&
        runtimeState.tiles.stats.downloading === 0
      )
        dependencies.runDownloadQueues();
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
          dependencies.getTileScreenError
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
        const support = new Set<Tile>();
        const unpreparedParents = new Set<Tile>();
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
        const loadedViewportCut = collectLoadedMeshReceiverCandidates(
          runtimeState.tiles.rootTileset.root,
          receiverErrorTarget,
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
          undefined,
          undefined,
          (tile, support) =>
            (!support &&
              !dependencies.isTileInMainView(tile as RuntimeTile) &&
              !dependencies.getTileCameraDemand(tile as RuntimeTile)
                .receiver) ||
            attachment.isDeferredMaterialReady(tile),
          frameState.retainedMeshAncestors,
          {
            published: runtimeState.displayedMeshFrontier,
            // Hard shadows use the currently committed LOD. Only coverage,
            // not first-image pixel error, is a prerequisite for that draw.
            allowCoarseBootstrap: runtimeState.pendingShadowView !== null,
            firstImageErrorTargetPixels:
              runtimeState.options.firstImageErrorTargetPixels,
            completeOffscreenFamilies: !viewportBootstrap,
            support,
            unpreparedParents,
            onWait:
              runtimeState.options.diagnostics &&
              runtimeState.options.tileTelemetry !== false
                ? (tile, reason, blocker) =>
                    dependencies.recordTileWait(
                      tile,
                      "receiver",
                      reason,
                      blocker
                    )
                : undefined,
            // Decision: SHADOW-RECEIVER-COVERAGE-20260921 in TILES_COVERAGE.md.
            // Shadows may refine their caster cut separately, but colour must
            // keep a ready parent until all required replacement branches draw.
            atomic:
              viewportBootstrap ||
              !runtimeState.shadowView ||
              runtimeState.displayedMeshFrontier.size > 0,
            onIncompletePublishedFamily: (parent) => {
              if (
                !runtimeState.options.diagnostics ||
                frameState.reportedIncompleteFamilies.has(parent)
              )
                return;
              frameState.reportedIncompleteFamilies.add(parent);
              // The missing siblings join the refinement support below and
              // are re-requested at repair priority; nothing is lost.
              console.warn(
                "[tiles3d] Published REPLACE family incomplete; re-requesting siblings",
                parent.content?.uri
              );
            },
          }
        );
        attachment.updateMeshRefinementSupport(support, unpreparedParents);
        abortStaleDownloads();
        runtimeState.lastLoadedViewportCutSize = loadedViewportCut.size;
        runtimeState.displayedMeshFrontier = retainMeshDetailFrontier({
          previous: runtimeState.displayedMeshFrontier,
          proposed: loadedViewportCut,
          requestedError: runtimeState.shadowView
            ? receiverErrorTarget
            : retainedDetailErrorTarget,
          inView: inReceiverView,
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
                    runtimeState.ringRefinePasses
                  )
                );
              },
        });
        collectResidentAncestors(
          runtimeState.displayedMeshFrontier,
          runtimeState.extentGeometricError,
          runtimeState.residentAncestors
        );
        if (runtimeState.shadowView) {
          dependencies.advanceMeshShadowCorridors(
            runtimeState.displayedMeshFrontier,
            traversalFrontier
          );
        }
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
        // A complete replacement cut owns publication. Never draw a parent
        // underneath partial children: keep that parent as the surface instead.
        const previousUnderlay = runtimeState.meshUnderlayFrontier;
        runtimeState.meshUnderlayFrontier = new Set();
        const underlay = runtimeState.meshUnderlayFrontier;
        const mountedModels = new Set(runtimeState.tiles.group.children);
        for (const tile of new Set([
          ...traversalFrontier,
          ...displayed,
          ...underlay,
          ...previousUnderlay,
        ])) {
          // Atomic publication, without fades; preserve the layer opacity.
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
            setTileDepthUnderlay(
              model,
              isUnderlay,
              runtimeState.extentFloorInView.has(tile) ? -2 : -1
            );
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
      runtimeState.lastMainViewConverged = dependencies.mainViewConverged();
      const hadBaseCoverage = runtimeState.meshBaseCoverageReady;
      runtimeState.meshBaseCoverageReady =
        dependencies.mainViewWithinErrorFactor(
          Math.max(
            initialMeshLoadError(
              runtimeState.requestedErrorTarget,
              runtimeState.options.baseErrorTargetPixels
            ),
            runtimeState.memoryErrorTarget
          ) / runtimeState.effectiveErrorTarget,
          false
        );
      if (
        runtimeState.meshBaseCoverageReady &&
        runtimeState.meshInitialHandoverDone &&
        runtimeState.displayedMeshFrontier.size > 0 &&
        (runtimeState.options.handoverErrorTargetPixels !== undefined
          ? runtimeState.meshInitialHandoverDone
          : !runtimeState.shadowView ||
            (runtimeState.lastMainViewConverged &&
              runtimeState.effectiveErrorTarget ===
                runtimeState.requestedErrorTarget)) &&
        !runtimeState.extentFloorArmed
      ) {
        // Decision: VIEWPORT-FIRST-QUALITY-20260916 in TILES_COVERAGE.md.
        // Initial view -> residual tree with transitions -> final idle quality.
        // Shadow receivers keep their independent receiver/caster gate.
        runtimeState.extentFloorArmed = true;
        runtimeState.extentFloorAuditPending = true;
        runtimeState.tiles.dispatchEvent({ type: "needs-update" });
      }
      // Recover coarse coverage mid-motion before admitting finer detail.
      if (
        !runtimeState.meshBaseCoverageReady &&
        !runtimeState.tiles.loadAncestors &&
        runtimeState.map?.isMoving?.() === true &&
        runtimeState.effectiveErrorTarget !==
          initialMeshLoadError(
            runtimeState.requestedErrorTarget,
            runtimeState.options.baseErrorTargetPixels
          )
      )
        dependencies.applyEffectiveErrorTarget(
          initialMeshLoadError(
            runtimeState.requestedErrorTarget,
            runtimeState.options.baseErrorTargetPixels
          )
        );
      if (!hadBaseCoverage && runtimeState.meshBaseCoverageReady) {
        // A parked native queue has no running job left to wake it.
        runtimeState.tiles.parseQueue.scheduleJobRun();
        for (const queue of runtimeState.tiles.downloadQueue.originQueues.values())
          queue.scheduleJobRun();
      }
      if (
        (runtimeState.options.tileTelemetry === true ||
          (localTelemetry && runtimeState.tileBoundsVisible)) &&
        runtimeState.options.tileTelemetry !== false &&
        performance.now() - runtimeState.lastRuntimeDebugAt >= 1_000
      ) {
        runtimeState.lastRuntimeDebugAt = performance.now();
        const tileEvents = [...frameState.telemetryTiles].map((tile) => {
          const progress = dependencies.getTileDebugProgress(tile);
          const inView = dependencies.isTileInMainView(tile as RuntimeTile);
          const bounds = (tile as RuntimeTile).engineData?.boundingVolume;
          if (bounds) {
            bounds.getSphere(telemetrySphere);
            telemetryCenter
              .copy(telemetrySphere.center)
              .applyMatrix4(runtimeState.tileViewProjection);
          }
          return {
            url: resolveTileContentUrl(tile),
            inView,
            shadowOnly:
              !inView && (tile as RuntimeTile).shadowReceiverCurrent === true,
            externalTileset: tile.internal.hasUnrenderableContent,
            loadingState: tile.internal.loadingState,
            lodDepth: tile.internal.depth,
            geometricError: tile.geometricError,
            screenErrorPixels: tile.traversal.error,
            cameraDistance: tile.traversal.distanceFromCamera,
            screenCenterDistanceNdc: bounds
              ? Math.hypot(telemetryCenter.x, telemetryCenter.y)
              : null,
            ...progress,
            steps: getThreeTileDiagnosticSteps(
              progress,
              runtimeState.shadowView !== null,
              performance.now()
            ),
          };
        });
        frameState.telemetryTiles.clear();
        console.debug(
          "[tiles3d-debug] runtime state",
          JSON.stringify({
            frameCount: runtimeState.tiles.frameCount,
            visible: runtimeState.tiles.visibleTiles.size,
            active: runtimeState.tiles.activeTiles.size,
            groupChildren: runtimeState.tiles.group.children.length,
            queued: runtimeState.tiles.stats.queued,
            downloading: runtimeState.tiles.stats.downloading,
            parsing: runtimeState.tiles.stats.parsing,
            ...attachment.getQueueTelemetry(),
            viewportCut: runtimeState.lastLoadedViewportCutSize,
            retainedViewport: runtimeState.displayedMeshFrontier.size,
            corridorTiles: runtimeState.committedMeshCasterFrontier.size,
            shadowSelectionEnabled: runtimeState.shadowSelectionEnabled,
            receiverCount: runtimeState.shadowReceiverMask?.sourceCount ?? 0,
            tileEvents,
            tileWaitEvents: dependencies.drainTileWaitEvents(),
            telemetryDropped: frameState.telemetryDropped,
            requestConcurrency:
              runtimeState.tiles.downloadQueue.maxJobsPerOrigin,
            perOriginConcurrency:
              runtimeState.tiles.downloadQueue.maxJobsPerOrigin,
            memoryAdmissionPaused: runtimeState.memoryAdmissionPaused,
            effectiveErrorTarget: runtimeState.effectiveErrorTarget,
            requestedErrorTarget: runtimeState.requestedErrorTarget,
            mainViewConverged: runtimeState.lastMainViewConverged,
          })
        );
        frameState.telemetryDropped = 0;
      }
      if (runtimeState.tileBoundsVisible) dependencies.syncTileDebugOverlay();
      else if (frameState.telemetryTiles.size) {
        frameState.telemetryTiles.clear();
        frameState.telemetryDropped = 0;
      }
      if (completingShadowTraversal)
        runtimeState.shadowSelectionNeedsTraversal = false;
      dependencies.maybeFinalizeShadowSelection();
      if (!runtimeState.shadowSelectionEnabled)
        dependencies.measureUsedBytesMain();
      dependencies.applyErrorTargetPolicy();
      dependencies.applyRequestConcurrency();
      if (runtimeState.viewQualityAuditPasses > 0) {
        runtimeState.viewQualityAuditPasses -= 1;
        if (runtimeState.viewQualityAuditPasses > 0) {
          runtimeState.tiles.dispatchEvent({ type: "needs-update" });
        }
      }
      dependencies.maybeEnableShadowSelection();
      if (runtimeState.options.providesTerrain) {
        // At the ceiling every frame is a sweep: the skip strategy's pinned
        // refinements must give way to the coarser cut of the new view.
        if (
          runtimeState.tiles.loadAncestors === false &&
          runtimeState.map?.isMoving?.() !== true &&
          runtimeState.tiles.lruCache.isFull()
        )
          runtimeState.meshDemandSweepPending = true;
        dependencies.sweepSettledMeshDemand();
        dependencies.scheduleSettledMeshAudit();
        refineRingCascade();
        if (runtimeState.map?.isMoving?.() !== true) scheduleCascadeTick();
      }
    } catch (error) {
      if (TILE_MEMORY_ALLOCATION_ERROR.test(String(error))) {
        runtimeState.allocationFailed = true;
        dependencies.recordCacheCeilingFailure("allocation");
        dependencies.applyRequestConcurrency();
      }
      console.error("[tiles3d] update failed:", error);
    }
    dependencies.prioritizeQueuedTiles();

    // Downloads, decoding and parked queues do not change the image. Native
    // needs-update/load/material events wake the scene when work completes;
    // only bounded publication audits need another frame without such an event.
    if (
      !runtimeState.memoryAdmissionPaused &&
      !runtimeState.loadingPaused &&
      runtimeState.viewQualityAuditPasses > 0
    ) {
      runtimeState.map.triggerRepaint();
    }
    dependencies.notifyRequestStateChange();
  };

  return update;
}
