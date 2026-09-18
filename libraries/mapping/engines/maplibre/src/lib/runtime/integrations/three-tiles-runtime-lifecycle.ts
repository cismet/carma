import type { Tile } from "3d-tiles-renderer/core";
import * as THREE from "three";
import { getCameraLocalMercatorFit } from "@carma-geo/proj";

import { isLocalhostHostname } from "@carma-commons/utils";

import type { SharedThreeSceneFrame } from "../../core/shared-three-scene-types";
import {
  createTileCameraDemand,
  snapshotTileCameraViews,
  TILE_CAMERA_ROLE,
  TILE_MAIN_OBSERVER_ID,
  tileCameraViewsSignature,
} from "../../core/tile-camera-demand";
import {
  setTileShadowRole,
  setTileDepthUnderlay,
} from "./three-tiles-shadow-role";
import {
  TILE_MEMORY_ALLOCATION_ERROR,
  initialMeshLoadError,
  idleRingAllowedError,
} from "./three-tiles-load-policy";
import {
  collectLoadedMeshReceiverCandidates,
  getRetainedMeshAncestors,
  retainMeshDetailFrontier,
  collectResidentAncestors,
} from "./three-tiles-mesh-frontier";
import { createThreeTilesCascade } from "./three-tiles-runtime-cascade";
import { createTileDrawObserver } from "./three-tiles-draw-observer";
import { createThreeTilesRuntimeAttachment } from "./three-tiles-runtime-attachment";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import type { RuntimeLruCache, RuntimeTile } from "./three-tiles-runtime-types";
import {
  FAILED_LOADING_STATE,
  UNLOADED_LOADING_STATE,
  resolveTileContentUrl,
} from "./three-tiles-runtime-vendor";
import {
  MESH_MOTION_COVERAGE_INTERVAL_MS,
  VIEW_QUALITY_AUDIT_PASSES,
} from "./three-tiles-runtime-config";
import {
  createTilesCameraSet,
  resolveTilesViewCamera,
} from "./tiles-camera-set";

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
    | "refreshRenderedMaterials"
    | "applyMaterialFlags"
    | "readModelFrameBounds"
    | "updateFrameFromTiles"
    | "invalidateShadowRegionRevisions"
    | "reapplyCacheBoundsIfDrifted"
    | "applyRequestConcurrency"
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
  const telemetryTiles = new Set<Tile>();
  let retainedMeshAncestors = new Set<Tile>();
  const reportedIncompleteFamilies = new WeakSet<Tile>();
  let publishedContentRevision = -1;
  const drawObserver = createTileDrawObserver((tile) => {
    const requestedAt = tile.firstPublicationRequestedAt;
    if (requestedAt !== undefined) {
      motionPrefetch.observeLatency(performance.now() - requestedAt);
      delete tile.firstPublicationRequestedAt;
    }
  });
  const isTileInAnyView = (tile: RuntimeTile) =>
    dependencies.isTileInMainView(tile) ||
    dependencies.getTileCameraDemand(tile).required;
  let telemetryDropped = 0;
  const telemetryCenter = new THREE.Vector3();
  const telemetrySphere = new THREE.Sphere();
  const noteTileActivity = (tile: Tile) => {
    if (
      runtimeState.disposed ||
      !localTelemetry ||
      !runtimeState.tileBoundsVisible ||
      runtimeState.options.tileTelemetry === false
    )
      return;
    if (telemetryTiles.has(tile)) return;
    if (telemetryTiles.size >= 32) {
      telemetryDropped += 1;
      return;
    }
    telemetryTiles.add(tile);
  };
  const handleDownloadStart = ({ tile }: { tile: Tile }) => {
    if (!runtimeState.tileBoundsVisible) return;
    const progress = dependencies.getTileDebugProgress(tile);
    progress.downloadStartedAt = performance.now();
    progress.downloadFinishedAt = undefined;
    progress.parseStartedAt = undefined;
    progress.parseFinishedAt = undefined;
    progress.lastError = undefined;
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
  let hasBootstrapPayload = false;
  const handleModelLoad: ThreeTilesRuntimeServices["handleModelLoad"] =
    (event: { scene?: THREE.Object3D; tile?: Tile; url?: string }) => {
      if (event.tile && runtimeState.tileBoundsVisible) {
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
        hasBootstrapPayload = true;
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
      if (event.tile && runtimeState.tileBoundsVisible)
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
    clearTelemetry: () => telemetryTiles.clear(),
    getRetainedMeshAncestors: () => retainedMeshAncestors,
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
  let publishedNativeFrontier = new Set<Tile>();
  // Live mount: an extra parent between the offset group and the tileset,
  // refitted at the camera target. Moving the parent moves rendering, picking
  // and loader bounds together, without replacing the tileset or reparsing any
  // resident GPU resources.
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
    if (
      runtimeState.options.providesTerrain &&
      Number.isFinite(runtimeState.options.baseErrorTargetPixels)
    )
      runtimeState.tiles.loadAncestors =
        !runtimeState.shadowView &&
        !hasBootstrapPayload &&
        !runtimeState.extentFloorArmed &&
        runtimeState.displayedMeshFrontier.size === 0;
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
      runtimeState.cameraSet.update(
        viewCamera,
        frame.viewport.x,
        frame.viewport.y
      );
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
            viewport: [frame.viewport.x, frame.viewport.y],
            // UNIFIED-VISIBLE-SSE-20260916: sharing a pool must preserve each
            // camera's request, including the main observer's requested target.
            errorTargetPixels: frame.tileCameraViews?.length
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
        retainedMeshAncestors = getRetainedMeshAncestors(
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
        (runtimeState.meshContentRevision !== publishedContentRevision ||
          runtimeState.tiles.frameCount !== previousTraversal ||
          runtimeState.mainViewProjectionChanged ||
          completingShadowTraversal)
      ) {
        const support = new Set<Tile>();
        // Multi-camera screen errors are demand ratios normalized to the
        // effective target. Comparing them to the raw requested target would
        // refine again by the staging factor and churn the resident cut.
        const receiverErrorTarget =
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
          isTileInAnyView,
          dependencies.getTileScreenError,
          undefined,
          undefined,
          (tile, support) =>
            (!support &&
              !dependencies.isTileInMainView(tile as RuntimeTile) &&
              !dependencies.getTileCameraDemand(tile as RuntimeTile)
                .receiver) ||
            attachment.isDeferredMaterialReady(tile),
          retainedMeshAncestors,
          {
            published: runtimeState.displayedMeshFrontier,
            support,
            atomic: !runtimeState.shadowView,
            onIncompletePublishedFamily: (parent) => {
              if (
                !runtimeState.options.diagnostics ||
                reportedIncompleteFamilies.has(parent)
              )
                return;
              reportedIncompleteFamilies.add(parent);
              // The missing siblings join the refinement support below and
              // are re-requested at repair priority; nothing is lost.
              console.warn(
                "[tiles3d] Published REPLACE family incomplete; re-requesting siblings",
                parent.content?.uri
              );
            },
          }
        );
        attachment.updateMeshRefinementSupport(support);
        abortStaleDownloads();
        runtimeState.lastLoadedViewportCutSize = loadedViewportCut.size;
        runtimeState.displayedMeshFrontier = retainMeshDetailFrontier({
          previous: runtimeState.displayedMeshFrontier,
          proposed: loadedViewportCut,
          requestedError: runtimeState.shadowView
            ? receiverErrorTarget
            : retainedDetailErrorTarget,
          inView: isTileInAnyView,
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
          if (model) {
            setTileShadowRole(model, {
              receiver: runtimeState.shadowView
                ? runtimeState.committedMeshReceiverFrontier.has(tile)
                : visible && dependencies.isTileInMainView(tile as RuntimeTile),
              caster: runtimeState.shadowView
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
        publishedContentRevision = runtimeState.meshContentRevision;
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
        runtimeState.displayedMeshFrontier.size > 0 &&
        (!runtimeState.shadowView ||
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
        localTelemetry &&
        runtimeState.tileBoundsVisible &&
        runtimeState.options.tileTelemetry !== false &&
        performance.now() - runtimeState.lastRuntimeDebugAt >= 1_000
      ) {
        runtimeState.lastRuntimeDebugAt = performance.now();
        const tileEvents = [...telemetryTiles].map((tile) => {
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
          };
        });
        telemetryTiles.clear();
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
            telemetryDropped,
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
        telemetryDropped = 0;
      }
      if (runtimeState.tileBoundsVisible) dependencies.syncTileDebugOverlay();
      else if (telemetryTiles.size) {
        telemetryTiles.clear();
        telemetryDropped = 0;
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
