import type { Tile } from "3d-tiles-renderer/core";
import * as THREE from "three";

import { isLocalhostHostname } from "@carma-commons/utils";

import { createTileDrawObserver } from "./three-tiles-draw-observer";
import { TILE_MEMORY_ALLOCATION_ERROR } from "./three-tiles-load-policy";
import { getRetainedMeshAncestors } from "./three-tiles-mesh-frontier";
import { createThreeTilesRuntimeAttachment } from "./three-tiles-runtime-attachment";
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
import {
  FAILED_LOADING_STATE,
  resolveTileContentUrl,
  UNLOADED_LOADING_STATE,
} from "./three-tiles-runtime-vendor";
import { setTileShadowRole } from "./three-tiles-shadow-role";

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
    | "motionCoverageDue"
    | "meshBaseCoverageReady"
    | "meshInitialHandoverDone"
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
    | "assignTilePriority"
    | "handleWireBytes"
    | "syncTileDebugOverlay"
    | "applyCacheBudget"
    | "getTileCameraDemand"
    | "getTileRequestPriority"
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
    reportedIncompleteFamilies: new WeakSet(),
    publishedContentRevision: -1,
    hasBootstrapPayload: false,
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

  // A standalone tileset carries absolute heights but the map has no terrain
  // to lift its centre. Probe the tileset under the layer origin and lower the
  // whole set by that height, so its ground meets the map plane. Refined while
  // finer tiles arrive; settled once the hit comes from a fine tile.
  const groundProbe = new THREE.Raycaster();
  let groundReferenceSettled = false;
  const GROUND_REFERENCE_FINE_ERROR_METERS = 2;
  const probeGroundReference = (tile?: Tile) => {
    if (
      !runtimeState.options.selfGroundReference ||
      groundReferenceSettled ||
      !runtimeState.tiles
    )
      return;
    runtimeState.orientationGroup.updateMatrixWorld(true);
    const origin = runtimeState.orientationGroup.localToWorld(
      new THREE.Vector3(0, 10_000, 0)
    );
    const down = new THREE.Vector3(0, -1, 0).transformDirection(
      runtimeState.orientationGroup.matrixWorld
    );
    groundProbe.set(origin, down);
    groundProbe.far = 20_000;
    const hit = groundProbe
      .intersectObject(runtimeState.tiles.group, true)
      .find(({ object }) => (object as THREE.Mesh).isMesh && object.visible);
    if (!hit) return;
    // Local to the offset group: the tileset's own height, offset excluded.
    const groundMeters = runtimeState.offsetGroup.worldToLocal(
      hit.point.clone()
    ).y;
    if (!Number.isFinite(groundMeters)) return;
    if (Math.abs(runtimeState.offsetGroup.position.y + groundMeters) > 0.25) {
      runtimeState.offsetGroup.position.y = -groundMeters;
      runtimeState.map?.triggerRepaint();
    }
    if (
      (tile?.geometricError ?? Infinity) <= GROUND_REFERENCE_FINE_ERROR_METERS
    )
      groundReferenceSettled = true;
  };
  const handleModelLoad: ThreeTilesRuntimeServices["handleModelLoad"] =
    (event: { scene?: THREE.Object3D; tile?: Tile; url?: string }) => {
      if (event.tile) {
        dependencies.getTileDebugProgress(event.tile).publicationStartedAt =
          performance.now();
        dependencies.getTileDebugProgress(event.tile).loadedAt ??=
          performance.now();
        noteTileActivity(event.tile);
      }
      runtimeState.meshContentRevision += 1;
      if (event.tile) {
        runtimeState.shadowRegionWorldBounds.delete(event.tile);
        runtimeState.mainViewIntersectionCache.delete(event.tile);
      }
      if (event.tile?.internal?.hasRenderableContent)
        frameState.hasBootstrapPayload = true;
      if (event.tile)
        runtimeState.tileRetries.handleSuccess(event.tile, event.url);
      const changedBounds: THREE.Box3[] = [];
      if (event.scene) {
        if (!event.tile || attachment.isDeferredMaterialReady(event.tile))
          dependencies.refreshRenderedMaterials(event.scene);
        else dependencies.applyMaterialFlags(event.scene);
        const bounds = dependencies.readModelFrameBounds(
          event.scene,
          new THREE.Box3()
        );
        if (!bounds.isEmpty()) changedBounds.push(bounds.clone());
      }
      probeGroundReference(event.tile);
      dependencies.invalidateShadowRegionRevisions(changedBounds);
      // Register partial caster materials; only atomic handover invalidates pages.
      const unpublishedMesh =
        runtimeState.options.providesTerrain &&
        runtimeState.shadowView &&
        event.tile &&
        !runtimeState.committedMeshCasterFrontier.has(event.tile) &&
        !runtimeState.committedMeshReceiverFrontier.has(event.tile);
      if (unpublishedMesh && event.scene)
        setTileShadowRole(event.scene, { receiver: false, caster: false });
      runtimeState.options.onContentChanged?.(
        unpublishedMesh ? [] : changedBounds,
        event.scene ? [event.scene] : undefined
      );
      runtimeState.lastProgressAt = Date.now();
      if (event.tile && runtimeState.tiles) {
        const registeredBytes = runtimeState.tiles.lruCache.getMemoryUsage(
          event.tile
        );
        runtimeState.bytesPredictor.observe(
          {
            url: event.url ?? resolveTileContentUrl(event.tile),
            geometricError: event.tile.geometricError,
          },
          registeredBytes
        );
        dependencies.reapplyCacheBoundsIfDrifted();
      }
      runtimeState.payloadAwareConcurrency.observeSuccess();
      dependencies.applyRequestConcurrency();
      if (event.tile && event.scene)
        drawObserver.attach(event.tile as RuntimeTile, event.scene);
      dependencies.notifyRequestStateChange();
      dependencies.requestRender();
      if (event.tile)
        dependencies.getTileDebugProgress(event.tile).publicationFinishedAt =
          performance.now();
    };

  const handleModelDispose: ThreeTilesRuntimeServices["handleModelDispose"] =
    (event: { scene?: THREE.Object3D; tile?: Tile }) => {
      if (event.scene) drawObserver.detach(event.scene);
      runtimeState.meshContentRevision += 1;
      const changedBounds: THREE.Box3[] = [];
      if (event.scene) {
        const bounds = dependencies.readModelFrameBounds(
          event.scene,
          new THREE.Box3()
        );
        if (!bounds.isEmpty()) changedBounds.push(bounds);
        runtimeState.modelLocalBounds.delete(event.scene);
      }
      if (event.tile) {
        runtimeState.shadowRegionWorldBounds.delete(event.tile);
        runtimeState.mainViewIntersectionCache.delete(event.tile);
      }
      dependencies.invalidateShadowRegionRevisions(changedBounds);
      if (event.scene) {
        dependencies.restoreClayMaterials(event.scene);
        dependencies.restoreLitTextureMaterials(event.scene);
      }
      runtimeState.options.onContentChanged?.(changedBounds);
      // Freed space admits waiting tiles only through a new traversal, which
      // the change-gated update would otherwise wait for the camera to trigger.
      if (runtimeState.tiles && !runtimeState.tiles.lruCache.isFull()) {
        runtimeState.tiles.dispatchEvent({ type: "needs-update" });
        dependencies.requestRender();
      }
    };

  const handleTilesetLoad: ThreeTilesRuntimeServices["handleTilesetLoad"] =
    (event: { url?: string }) => {
      if (localTelemetry && runtimeState.tileBoundsVisible)
        console.debug(
          "[tiles3d-debug] tileset loaded",
          event.url ?? runtimeState.tilesetUrl
        );
      runtimeState.meshContentRevision += 1;
      runtimeState.shadowRegionRevisions.clear();
      runtimeState.mainViewIntersectionCache = new WeakMap();
      dependencies.clearKickstartTimer();
      runtimeState.tileRetries.handleSuccess(null, event.url);
      runtimeState.payloadAwareConcurrency.observeSuccess();
      dependencies.applyTilesetMinResolution();
      dependencies.applyRequestConcurrency();
      dependencies.requestRender();
    };

  // D8: retry admission keeps failed tiles UNLOADED, retaining the parent cut.
  const handleLoadError: ThreeTilesRuntimeServices["handleLoadError"] =
    (event: { tile?: Tile | null; url?: string | URL; error?: unknown }) => {
      console.warn("[tiles3d-debug] load error", {
        url: String(event.url ?? runtimeState.tilesetUrl),
        error: String(event.error),
      });
      if (TILE_MEMORY_ALLOCATION_ERROR.test(String(event.error))) {
        runtimeState.allocationFailed = true;
        dependencies.recordCacheCeilingFailure("allocation");
        dependencies.applyRequestConcurrency();
      }
      const failedTile = event.tile ?? null;
      if (failedTile && runtimeState.tileBoundsVisible) {
        dependencies.getTileDebugProgress(failedTile).lastError = String(
          event.error
        ).slice(0, 240);
        noteTileActivity(failedTile);
      }
      if (failedTile && runtimeState.deferred.has(failedTile)) return;
      const retryState = runtimeState.tileRetries.handleFailure(
        failedTile,
        event.url,
        event.error
      );
      if (failedTile && runtimeState.tiles && retryState !== "ignored") {
        const wasFailed =
          failedTile.internal.loadingState === FAILED_LOADING_STATE;
        const removed = runtimeState.tiles.lruCache.remove(failedTile);
        if (!removed && wasFailed) {
          failedTile.internal.loadingState = UNLOADED_LOADING_STATE;
        }
        if (wasFailed) {
          runtimeState.tiles.stats.failed = Math.max(
            0,
            runtimeState.tiles.stats.failed - 1
          );
        }
        if (retryState === "exhausted") {
          runtimeState.tiles.dispatchEvent({ type: "needs-update" });
          dependencies.requestRender();
        }
      }
      runtimeState.payloadAwareConcurrency.observeFailure(event.error);
      dependencies.applyRequestConcurrency();
      dependencies.scheduleRequestBackoffRecovery();
      // A failed root is retried by the controller; tile errors keep the
      // kickstart running until the root tileset arrives.
      if (!failedTile) dependencies.clearKickstartTimer();
      dependencies.maybeEnableShadowSelection();
      dependencies.notifyRequestStateChange();
    };

  const handleTilesLoadEnd: ThreeTilesRuntimeServices["handleTilesLoadEnd"] =
    () => {
      // Completion wakes one audit for unresolved coverage; deferred tiles
      // alone must not sustain an endless render loop.
      if (
        runtimeState.options.providesTerrain &&
        (!runtimeState.meshBaseCoverageReady ||
          runtimeState.extentFloorAuditPending ||
          runtimeState.deferred.size > 0) &&
        !runtimeState.meshDemandSweepPending &&
        runtimeState.viewQualityAuditPasses === 0
      ) {
        runtimeState.meshDemandSweepPending = true;
        dependencies.resetDeferredTiles();
        runtimeState.viewQualityAuditPasses = 1;
        runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
        dependencies.requestRender();
      }
      dependencies.notifyRequestStateChange();
      dependencies.maybeEnableShadowSelection();
    };

  const {
    motionPrefetch,
    prefetchZoom,
    returnToBaseStage,
    abortStaleDownloads,
    isTileRequestNeeded,
    refineRingCascade,
    scheduleCascadeTick,
    clearCascadeTick,
  } = createThreeTilesCascade(runtimeState, dependencies);
  const handleViewStart: ThreeTilesRuntimeServices["handleViewStart"] = () => {
    runtimeState.motionCoverageDue = true;
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
        runtimeState.motionCoverageDue = true;
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
    runtimeState.motionCoverageDue = true;
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
