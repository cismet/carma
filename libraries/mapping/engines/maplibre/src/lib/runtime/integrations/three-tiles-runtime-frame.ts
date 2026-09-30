import type {
  ThreeTilesFrameRuntimeState,
  ThreeTilesFrameDependencies,
  ThreeTilesFrameHooks,
} from "./three-tiles-runtime-frame-types";
import {
  areActiveMeshViewsConverged,
  getRuntimeTileCameraViews,
  getRetainedMeshDetailTarget,
} from "./three-tiles-runtime-cameras";
import { createThreeTilesFramePublication } from "./three-tiles-runtime-frame-publication";

import * as THREE from "three";

import { getCameraLocalMercatorFit } from "@carma-geo/proj";

import type { SharedThreeSceneFrame } from "../../core/shared-three-scene-types";
import {
  createTileCameraDemand,
  tileCameraViewsSignature,
} from "../../core/tile-camera-demand";

import { initialMeshLoadError } from "../../core/mesh-error-policy";
import { TILE_MEMORY_ALLOCATION_ERROR } from "../../core/tile-cache-policy";

import { getRetainedMeshAncestors } from "../../core/mesh-tile-retention";

import type { ThreeTilesRuntimeServices } from "./three-tiles-runtime-context";
import type {
  RuntimeLruCache,
  RuntimePriorityQueue,
  RuntimeTile,
} from "./three-tiles-runtime-types";
import { CACHE_CEILING_REASON } from "./three-tiles-cache-ceiling-memory";

import {
  createTilesCameraSet,
  resolveTilesViewCamera,
} from "./tiles-camera-set";

export type { ThreeTilesFrameState } from "./three-tiles-runtime-frame-types";

export function createThreeTilesFrameUpdate(
  runtimeState: ThreeTilesFrameRuntimeState,
  dependencies: ThreeTilesFrameDependencies,
  hooks: ThreeTilesFrameHooks
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
  } = hooks;
  const publishFrame = createThreeTilesFramePublication(
    runtimeState,
    dependencies,
    hooks
  );
  const cameraMount = new THREE.Group();
  cameraMount.matrixAutoUpdate = false;
  const mountAxisFlip = new THREE.Matrix4().makeRotationY(Math.PI);
  /** Anchor of the reference fit the mount was made at; null = never mounted. */
  let mountedReferenceLngLat: readonly [number, number] | null = null;
  let movingAtLastUpdate = false;
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
    const moving = runtimeState.map.isMoving?.() === true;
    let downloadDemandChanged = moving !== movingAtLastUpdate;
    movingAtLastUpdate = moving;
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
        runtimeState.retainedShadowRequests.clear();
        dependencies.resetDeferredTiles();
        runtimeState.tiles.dispatchEvent({ type: "needs-update" });
        // A downloaded, parked payload can enter the camera without another
        // download completing. Recheck its native parse queue on that event.
        runtimeState.tiles.parseQueue.scheduleJobRun();
      }
      const demandViews = getRuntimeTileCameraViews(
        runtimeState,
        viewCamera,
        lodViewport,
        frame.tileCameraViews
      );
      const cameraSignature = tileCameraViewsSignature(demandViews);
      // Relaxed motion/startup targets admit new coverage, not replacements
      // for an already-published idle-quality cut. Multi-camera SSE is a
      // demand ratio scaled by effectiveErrorTarget; its ratio=1 still means
      // each camera's requested quality (including the main idle target).
      const retainedDetailErrorTarget = getRetainedMeshDetailTarget(
        runtimeState,
        frame.tileCameraViews?.length ?? 0
      );
      // Decision: TILES_COVERAGE.md#motion-preserves-visible-detail
      // A relaxed motion or memory target controls new admissions only.
      const allowInViewCoarsening = false;
      const tileCamerasChanged =
        cameraSignature !== runtimeState.tileCameraSignature;
      downloadDemandChanged ||=
        runtimeState.mainViewProjectionChanged || tileCamerasChanged;
      if (tileCamerasChanged) {
        runtimeState.lastActiveViewsConverged = false;
        runtimeState.tileCameraSignature = cameraSignature;
        runtimeState.tileCameraDemand = createTileCameraDemand(demandViews);
        runtimeState.mainViewIntersectionCache = new WeakMap();
        runtimeState.meshDemandSweepPending = true;
        dependencies.resetDeferredTiles();
        runtimeState.tiles.dispatchEvent({ type: "needs-update" });
        runtimeState.tiles.parseQueue.scheduleJobRun();
      }
      const root = runtimeState.tiles.rootTileset?.root;
      const hadRecovery = runtimeState.meshCoverageRecovery;
      runtimeState.meshCoverageRecovery =
        runtimeState.options.providesTerrain === true &&
        runtimeState.displayedMeshFrontier.size > 0 &&
        !!root &&
        dependencies.isTileNeededForMeshCoverage(root);
      const viewportBootstrap =
        runtimeState.options.providesTerrain === true &&
        (!runtimeState.meshInitialHandoverDone ||
          runtimeState.meshCoverageRecovery);
      const inReceiverView = viewportBootstrap
        ? (tile: RuntimeTile) =>
            dependencies.getTileObserverDemand(tile).intersects
        : isTileInAnyView;
      if (hadRecovery !== runtimeState.meshCoverageRecovery) {
        runtimeState.meshDemandSweepPending = true;
        dependencies.resetDeferredTiles();
        runtimeState.tiles.dispatchEvent({ type: "needs-update" });
        runtimeState.tiles.parseQueue.scheduleJobRun();
        dependencies.runDownloadQueues();
      }
      // Native ancestor loading implicitly requests off-frustum siblings.
      // Our bounded first-image selection owns fallback coverage instead.
      if (runtimeState.options.providesTerrain)
        runtimeState.tiles.loadAncestors = false;
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
          dependencies.getTileScreenError,
          allowInViewCoarsening
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
        (runtimeState.mainViewProjectionChanged ||
          tileCamerasChanged ||
          hadRecovery !== runtimeState.meshCoverageRecovery)
      ) {
        for (const tile of (runtimeState.tiles.lruCache as RuntimeLruCache)
          .itemList)
          dependencies.assignTilePriority(tile as RuntimeTile);
      }
      const completingShadowTraversal =
        runtimeState.shadowSelectionNeedsTraversal;
      // Consume only the round we are starting. Publication can request the
      // next bounded reserve step while this frame is still being processed.
      runtimeState.shadowSelectionNeedsTraversal = false;
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
      publishFrame({
        previousTraversal,
        retainedDetailErrorTarget,
        allowInViewCoarsening,
        completingShadowTraversal,
        inReceiverView,
      });
      if (
        runtimeState.meshCoverageRecovery &&
        root &&
        !dependencies.isTileNeededForMeshCoverage(root)
      ) {
        runtimeState.meshCoverageRecovery = false;
        runtimeState.meshDemandSweepPending = true;
        runtimeState.tiles.dispatchEvent({ type: "needs-update" });
        runtimeState.tiles.parseQueue.scheduleJobRun();
        dependencies.runDownloadQueues();
      }
      runtimeState.lastMainViewConverged = dependencies.mainViewConverged();
      runtimeState.lastActiveViewsConverged = areActiveMeshViewsConverged(
        runtimeState,
        dependencies
      );
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
        !runtimeState.extentFloorArmed
      ) {
        // Decision: TILES_COVERAGE.md#startup-motion-and-reserve-admission.
        // Initial view -> residual tree with transitions -> final idle quality.
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
      dependencies.reportFrameTelemetry?.(runtimeState, dependencies, hooks);
      if (runtimeState.tileBoundsVisible) dependencies.syncTileDebugOverlay();
      else if (frameState.telemetryTiles.size) {
        frameState.telemetryTiles.clear();
        frameState.telemetryDropped = 0;
      }
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
        dependencies.recordCacheCeilingFailure(CACHE_CEILING_REASON.ALLOCATION);
        dependencies.applyRequestConcurrency();
      }
      console.error("[tiles3d] update failed:", error);
    }
    dependencies.prioritizeQueuedTiles();

    if (
      downloadDemandChanged &&
      runtimeState.options.providesTerrain &&
      runtimeState.tiles &&
      !runtimeState.memoryAdmissionPaused &&
      !runtimeState.loadingPaused
    ) {
      // Decision: TILES_COVERAGE.md#motion-preserves-visible-detail.
      // Prepared demand can release parked work while other downloads remain
      // active. Wake spare slots after publication/priority refresh, without
      // waiting for those transfers or re-auditing unchanged frames.
      for (const nativeQueue of runtimeState.tiles.downloadQueue.originQueues.values()) {
        const queue = nativeQueue as RuntimePriorityQueue;
        if (queue.items.length > 0 && queue.currJobs < queue.maxJobs)
          queue.scheduleJobRun();
      }
    }

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
