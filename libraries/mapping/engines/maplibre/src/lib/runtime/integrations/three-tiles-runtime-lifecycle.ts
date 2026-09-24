import type { Tile } from "3d-tiles-renderer/core";
import * as THREE from "three";

import { isLocalhostHostname } from "@carma-commons/utils";

import { createTileDrawObserver } from "./three-tiles-draw-observer";
import { getRetainedMeshAncestors } from "../../core/mesh-tile-retention";
import { createThreeTilesRuntimeAttachment } from "./three-tiles-runtime-attachment";
import { createThreeTilesLoadEvents } from "./three-tiles-runtime-load-events";
import { createThreeTilesGroundReferenceProbe } from "./three-tiles-runtime-ground-reference";
import { createThreeTilesCascade } from "./three-tiles-runtime-cascade";
import {
  MESH_MOTION_COVERAGE_INTERVAL_MS,
  VIEW_QUALITY_AUDIT_PASSES,
} from "./three-tiles-runtime-config";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import {
  createThreeTilesFrameUpdate,
  type ThreeTilesFrameState,
} from "./three-tiles-runtime-frame";
import type { RuntimeLruCache, RuntimeTile } from "./three-tiles-runtime-types";

/** lifecycle responsibility of the shared 3D Tiles runtime. */
export function createThreeTilesLifecycle(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    | "meshContentRevision"
    | "tileCameraDemand"
    | "tileCameraSignature"
    | "shadowRegionWorldBounds"
    | "mainViewIntersectionCache"
    | "tileRetries"
    | "options"
    | "lastProgressAt"
    | "tiles"
    | "bytesPredictor"
    | "payloadAwareConcurrency"
    | "modelLocalBounds"
    | "referenceToCurrent"
    | "currentToReference"
    | "tilesetUrl"
    | "shadowRegionRevisions"
    | "allocationFailed"
    | "deferred"
    | "meshBaseCoverageReady"
    | "meshInitialHandoverDone"
    | "meshCoverageRecovery"
    | "pendingShadowView"
    | "memoryErrorTarget"
    | "meshRefinementSupport"
    | "extentGeometricError"
    | "extentFloorArmed"
    | "extentFloorAuditPending"
    | "extentFloorPending"
    | "extentFloorInView"
    | "residentAncestors"
    | "lastTraversalMs"
    | "lastRingRefineAt"
    | "ringRefinePasses"
    | "materialRevision"
    | "meshAuditTimer"
    | "map"
    | "motionCoverageTimer"
    | "meshDemandSweepPending"
    | "viewQualityAuditPasses"
    | "lastTraversalFrameCount"
    | "shadowSelectionEnabled"
    | "shadowReceiverMask"
    | "mainViewSourceTiles"
    | "tileBoundingBox"
    | "tileBoundsTransform"
    | "shadowReceiverMatch"
    | "effectiveErrorTarget"
    | "memoryAdmissionPaused"
    | "loadingPaused"
    | "queuedThisTraversal"
    | "requestedErrorTarget"
    | "dracoLoader"
    | "outlineColor"
    | "outlineOpacity"
    | "originLngLat"
    | "normalParseConcurrency"
    | "offsetGroup"
    | "kickstartTimer"
    | "runtimeVisible"
    | "unsubscribeTerrainLoading"
    | "cameraSet"
    | "mainViewProjectionChanged"
    | "shadowSelectionNeedsTraversal"
    | "lastLoadedViewportCutSize"
    | "displayedMeshFrontier"
    | "meshUnderlayFrontier"
    | "shadowView"
    | "committedMeshReceiverFrontier"
    | "committedMeshCasterFrontier"
    | "lastRuntimeDebugAt"
    | "tileViewProjection"
    | "lastMainViewConverged"
    | "orientationGroup"
    | "disposed"
    | "requestBackoffTimer"
    | "clayMaterialStates"
    | "litTextureMaterialStates"
    | "tileDebugOverlay"
    | "tileBoundsVisible"
  >,
  dependencies: Pick<
    ThreeTilesRuntimeServices,
    | "getTileDebugProgress"
    | "recordTileRequestDecision"
    | "recordTileWait"
    | "drainTileWaitEvents"
    | "beginTileWaitObservation"
    | "endTileWaitObservation"
    | "refreshRenderedMaterials"
    | "applyMaterialFlags"
    | "readModelFrameBounds"
    | "updateFrameFromTiles"
    | "invalidateShadowRegionRevisions"
    | "reapplyCacheBoundsIfDrifted"
    | "applyRequestConcurrency"
    | "isTileInPrefetchMargin"
    | "recordCacheCeilingFailure"
    | "endCacheCeilingSession"
    | "applyTilesetMinResolution"
    | "notifyRequestStateChange"
    | "requestRender"
    | "restoreClayMaterials"
    | "restoreLitTextureMaterials"
    | "clearKickstartTimer"
    | "scheduleRequestBackoffRecovery"
    | "maybeEnableShadowSelection"
    | "resetDeferredTiles"
    | "requestShadowSelectionRefresh"
    | "recordTileIteration"
    | "applyTileDeferral"
    | "isTileInMainView"
    | "getTileObserverDemand"
    | "assignTilePriority"
    | "handleWireBytes"
    | "syncTileDebugOverlay"
    | "applyCacheBudget"
    | "getTileCameraDemand"
    | "getTileRequestPriority"
    | "isTileNeededForMeshCoverage"
    | "initialEffectiveErrorTarget"
    | "runDownloadQueues"
    | "handleContextLost"
    | "handleContextRestored"
    | "handleVisibilityChange"
    | "syncProjector"
    | "prepareViewFrustums"
    | "getTileScreenError"
    | "advanceMeshShadowCorridors"
    | "maybeFinalizeShadowSelection"
    | "measureUsedBytesMain"
    | "mainViewConverged"
    | "mainViewWithinErrorFactor"
    | "applyErrorTargetPolicy"
    | "applyEffectiveErrorTarget"
    | "getTileRingIndex"
    | "sweepSettledMeshDemand"
    | "scheduleSettledMeshAudit"
    | "prioritizeQueuedTiles"
    | "clearErrorTargetTimer"
    | "clearHiddenWipeTimer"
    | "disposeClayState"
    | "disposeLitTextureState"
    | "restoreShadowSides"
  >
) {
  const localTelemetry = isLocalhostHostname(globalThis.location?.hostname);
  // Bounded event samples, never a resident-cache scan. Decision:
  // TILE-PIPELINE-TELEMETRY-20260909 in engines/maplibre/README.md.
  const frameState: ThreeTilesFrameState = {
    retainedMeshAncestors: new Set(),
    publishedContentRevision: -1,
    telemetryTiles: new Set(),
    telemetryDropped: 0,
  };
  const drawObserver = createTileDrawObserver(
    (tile) => {
      dependencies.getTileDebugProgress(tile).visibleAt ??= performance.now();
      dependencies.recordTileWait(tile, "receiver", null);
      const requestedAt = tile.firstPublicationRequestedAt;
      if (requestedAt !== undefined) {
        motionPrefetch.observeLatency(performance.now() - requestedAt);
        delete tile.firstPublicationRequestedAt;
      }
    },
    (tile) => {
      if (
        !runtimeState.options.diagnostics ||
        runtimeState.options.tileTelemetry === false
      )
        return;
      const progress = dependencies.getTileDebugProgress(tile);
      progress.shadowDepthSubmittedAt ??= performance.now();
      if (progress.shadowPresentedAt === undefined)
        dependencies.recordTileWait(tile, "shadow", "shadow-accumulation");
    }
  );
  const isTileInAnyView = (tile: RuntimeTile) =>
    dependencies.isTileInMainView(tile) ||
    dependencies.getTileCameraDemand(tile).required;
  const telemetryCenter = new THREE.Vector3();
  const telemetrySphere = new THREE.Sphere();
  const noteTileActivity = (tile: Tile) => {
    if (
      runtimeState.disposed ||
      !(
        runtimeState.options.tileTelemetry === true ||
        (localTelemetry && runtimeState.tileBoundsVisible)
      ) ||
      runtimeState.options.tileTelemetry === false
    )
      return;
    if (frameState.telemetryTiles.has(tile)) return;
    if (frameState.telemetryTiles.size >= 32) {
      frameState.telemetryDropped += 1;
      return;
    }
    frameState.telemetryTiles.add(tile);
  };
  const handleDownloadStart = ({ tile }: { tile: Tile }) => {
    const progress = dependencies.getTileDebugProgress(tile);
    progress.downloadStartedAt = performance.now();
    progress.downloadFinishedAt = undefined;
    progress.parseStartedAt = undefined;
    progress.parseFinishedAt = undefined;
    progress.publicationStartedAt = undefined;
    progress.publicationFinishedAt = undefined;
    progress.loadedAt = undefined;
    progress.visibleAt = undefined;
    progress.shadowDepthSubmittedAt = undefined;
    progress.shadowPresentedAt = undefined;
    progress.lastError = undefined;
    progress.waits = undefined;
    noteTileActivity(tile);
  };

  const probeGroundReference =
    createThreeTilesGroundReferenceProbe(runtimeState);

  const {
    handleModelLoad,
    handleModelDispose,
    handleTilesetLoad,
    handleLoadError,
    handleTilesLoadEnd,
  } = createThreeTilesLoadEvents(
    runtimeState,
    dependencies,
    drawObserver,
    noteTileActivity,
    probeGroundReference,
    (tile) => attachment.isDeferredMaterialReady(tile),
    localTelemetry
  );

  const {
    motionPrefetch,
    prefetchZoom,
    returnToBaseStage,
    abortStaleDownloads,
    isTileRequestNeeded,
    getTileRequestNeed,
    refineRingCascade,
    scheduleCascadeTick,
    clearCascadeTick,
  } = createThreeTilesCascade(runtimeState, {
    ...dependencies,
    getDownloadPreemptionEligibility: () =>
      attachment.getDownloadPreemptionEligibility(),
  });
  const handleViewStart: ThreeTilesRuntimeServices["handleViewStart"] = () => {
    returnToBaseStage();
    dependencies.resetDeferredTiles();
    runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
    dependencies.requestRender();
    dependencies.applyRequestConcurrency();
    // Preserve the published cut while the next prepared view refreshes demand.
    if (runtimeState.meshAuditTimer !== null)
      clearTimeout(runtimeState.meshAuditTimer);
    runtimeState.meshAuditTimer = null;
    for (const tile of runtimeState.tiles?.loadingTiles ?? [])
      runtimeState.tiles?.markTileUsed(tile);
    // Cancellation must wait for the prepared camera, never pointer-down.
  };

  const scheduleMotionCoverage: ThreeTilesRuntimeServices["scheduleMotionCoverage"] =
    () => {
      if (
        !runtimeState.options.providesTerrain ||
        !runtimeState.tiles ||
        !runtimeState.map?.isMoving?.()
      )
        return;
      if (runtimeState.motionCoverageTimer !== null) return;
      // Coalesce latest-camera audits without trailing-debounce starvation
      // or tree traversal in the input handler.
      runtimeState.motionCoverageTimer = setTimeout(() => {
        runtimeState.motionCoverageTimer = null;
        dependencies.resetDeferredTiles();
        dependencies.requestShadowSelectionRefresh();
        runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
        dependencies.requestRender();
      }, MESH_MOTION_COVERAGE_INTERVAL_MS);
    };

  const handleViewEnd: ThreeTilesRuntimeServices["handleViewEnd"] = () => {
    runtimeState.meshBaseCoverageReady = false;
    returnToBaseStage();
    if (runtimeState.motionCoverageTimer !== null)
      clearTimeout(runtimeState.motionCoverageTimer);
    runtimeState.motionCoverageTimer = null;
    dependencies.applyRequestConcurrency();
    if (!runtimeState.tiles) return;
    if (runtimeState.options.providesTerrain) {
      runtimeState.meshDemandSweepPending = true;
    }
    dependencies.resetDeferredTiles();
    dependencies.requestShadowSelectionRefresh();
    runtimeState.viewQualityAuditPasses = VIEW_QUALITY_AUDIT_PASSES;
    runtimeState.tiles.dispatchEvent({ type: "needs-update" });
  };

  const handleUpdateAfter: ThreeTilesRuntimeServices["handleUpdateAfter"] =
    () => {
      const currentTiles = runtimeState.tiles;
      if (!currentTiles) return;
      const cache = currentTiles.lruCache as RuntimeLruCache;
      // A traversal skipped by the change gate never schedules the eviction
      // that would bring the cache back to its retention floor.
      const traversalRan =
        currentTiles.frameCount !== runtimeState.lastTraversalFrameCount;
      runtimeState.lastTraversalFrameCount = currentTiles.frameCount;
      if (!traversalRan && cache.cachedBytes > cache.minBytesSize) {
        cache.scheduleUnload();
      }
      const entriesBeforeUnload = cache.itemSet.size;
      queueMicrotask(() => {
        if (runtimeState.tiles !== currentTiles) return;
        if (cache.itemSet.size < entriesBeforeUnload) {
          currentTiles.dispatchEvent({ type: "needs-update" });
        }
      });
    };

  const handleTileVisibilityChange: ThreeTilesRuntimeServices["handleTileVisibilityChange"] =
    (event) => {
      if (!event.visible) return;
      const scene = (event.tile as RuntimeTile).engineData?.scene;
      if (
        !scene ||
        scene.userData.materialRevision === runtimeState.materialRevision
      )
        return;
      // Restyled while hidden (shadow mode toggled, clay or texture switch):
      // catch up before this frame draws it.
      if (attachment.isDeferredMaterialReady(event.tile))
        dependencies.refreshRenderedMaterials(scene);
      else dependencies.applyMaterialFlags(scene);
    };

  const attachment = createThreeTilesRuntimeAttachment(runtimeState, {
    endCacheCeilingSession: () => dependencies.endCacheCeilingSession(),
    ...dependencies,
    clearTelemetry: () => frameState.telemetryTiles.clear(),
    getRetainedMeshAncestors: () => frameState.retainedMeshAncestors,
    handleDownloadStart,
    handleLoadError,
    handleModelDispose,
    handleModelLoad,
    handleTileVisibilityChange,
    handleTilesetLoad,
    handleTilesLoadEnd,
    handleUpdateAfter,
    handleViewEnd,
    handleViewStart,
    localTelemetry,
    noteTileActivity,
    isTileRequestNeeded,
    getTileRequestNeed,
    scheduleMotionCoverage,
  });
  // Live mount: an extra parent between the offset group and the tileset,
  // refitted at the camera target. Moving the parent moves rendering, picking
  // and loader bounds together, without replacing the tileset or reparsing any
  // resident GPU resources.
  const update = createThreeTilesFrameUpdate(runtimeState, dependencies, {
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
  });

  const setVisible: ThreeTilesRuntimeServices["setVisible"] = (
    visible: boolean
  ) => {
    if (runtimeState.runtimeVisible === visible) return;
    runtimeState.runtimeVisible = visible;
    runtimeState.orientationGroup.visible = visible;
    dependencies.notifyRequestStateChange();
    if (!visible) {
      motionPrefetch.clear();
      clearCascadeTick();
      dependencies.clearErrorTargetTimer();
      runtimeState.viewQualityAuditPasses = 0;
      runtimeState.map?.triggerRepaint();
      return;
    }
    runtimeState.viewQualityAuditPasses = VIEW_QUALITY_AUDIT_PASSES;
    runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
    runtimeState.map?.triggerRepaint();
  };

  const setHeightOffset: ThreeTilesRuntimeServices["setHeightOffset"] = (
    offsetMeters: number
  ) => {
    runtimeState.offsetGroup.position.y = offsetMeters;
    runtimeState.map?.triggerRepaint();
  };

  const hasRenderableContent: ThreeTilesRuntimeServices["hasRenderableContent"] =
    () => {
      let renderable = false;
      runtimeState.tiles?.group.traverse((object) => {
        if ((object as THREE.Mesh).isMesh && object.visible) renderable = true;
      });
      return renderable;
    };

  const dispose: ThreeTilesRuntimeServices["dispose"] = () => {
    drawObserver.dispose();
    motionPrefetch.dispose();
    attachment.dispose();
  };
  return {
    getDrawStatus: () =>
      drawObserver.read(
        runtimeState.displayedMeshFrontier as Set<RuntimeTile>,
        runtimeState.tiles?.group
      ),
    setPrefetchCameraView: motionPrefetch.setView,
    getMotionPrefetchStats: motionPrefetch.getStats,
    prefetchZoom,
    handleModelLoad,
    handleTileVisibilityChange,
    handleModelDispose,
    handleTilesetLoad,
    handleLoadError,
    handleTilesLoadEnd,
    handleViewStart,
    scheduleMotionCoverage,
    handleViewEnd,
    handleUpdateAfter,
    onAdd: attachment.onAdd,
    update,
    setVisible,
    setHeightOffset,
    hasRenderableContent,
    dispose,
  };
}
