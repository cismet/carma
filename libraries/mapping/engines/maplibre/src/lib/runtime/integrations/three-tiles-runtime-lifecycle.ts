import type { Tile } from "3d-tiles-renderer/core";
import * as THREE from "three";

import { isLocalhostHostname } from "@carma-commons/utils";

import type { SharedThreeSceneFrame } from "../../core/shared-three-scene-types";
import { setTileShadowRole } from "./three-tiles-shadow-role";
import {
  TILE_MEMORY_ALLOCATION_ERROR,
  initialMeshLoadError,
} from "./three-tiles-load-policy";
import {
  collectLoadedMeshReceiverCandidates,
  getRetainedMeshAncestors,
  retainMeshDetailFrontier,
} from "./three-tiles-mesh-frontier";
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
    | "shadowRegionWorldBounds"
    | "mainViewIntersectionCache"
    | "tileRetries"
    | "options"
    | "lastProgressAt"
    | "tiles"
    | "bytesPredictor"
    | "payloadAwareConcurrency"
    | "modelWorldBounds"
    | "tilesetUrl"
    | "shadowRegionRevisions"
    | "allocationFailed"
    | "deferred"
    | "motionCoverageDue"
    | "meshBaseCoverageReady"
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
    | "readModelWorldBounds"
    | "invalidateShadowRegionRevisions"
    | "reapplyCacheBoundsIfDrifted"
    | "applyRequestConcurrency"
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
      if (event.tile)
        runtimeState.tileRetries.handleSuccess(event.tile, event.url);
      const changedBounds: THREE.Box3[] = [];
      if (event.scene) {
        if (!event.tile || attachment.isDeferredMaterialReady(event.tile))
          dependencies.refreshRenderedMaterials(event.scene);
        else dependencies.applyMaterialFlags(event.scene);
        const bounds = dependencies.readModelWorldBounds(
          event.scene,
          new THREE.Box3()
        );
        if (!bounds.isEmpty()) changedBounds.push(bounds.clone());
      }
      dependencies.invalidateShadowRegionRevisions(changedBounds);
      // Decoding a partial caster child is not a depth-cut publication. Register
      // its materials without invalidating hard/soft pages; the atomic caster
      // handover supplies regional invalidation when the complete family exists.
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
      dependencies.notifyRequestStateChange();
      dependencies.requestRender();
      if (event.tile && runtimeState.tileBoundsVisible)
        dependencies.getTileDebugProgress(event.tile).publicationFinishedAt =
          performance.now();
    };

  const handleModelDispose: ThreeTilesRuntimeServices["handleModelDispose"] =
    (event: { scene?: THREE.Object3D; tile?: Tile }) => {
      runtimeState.meshContentRevision += 1;
      const changedBounds: THREE.Box3[] = [];
      if (event.scene) {
        const cached = runtimeState.modelWorldBounds.get(event.scene);
        if (cached && !cached.bounds.isEmpty()) {
          changedBounds.push(cached.bounds.clone());
        }
        runtimeState.modelWorldBounds.delete(event.scene);
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
      dependencies.applyRequestConcurrency();
      dependencies.requestRender();
    };

  /**
   * D8: a failed tile leaves the cache so a later retry can be admitted again;
   * it stays UNLOADED and is skipped by `queueTileForDownload` while blocked,
   * so its parent keeps rendering as the fallback.
   */
  const handleLoadError: ThreeTilesRuntimeServices["handleLoadError"] =
    (event: { tile?: Tile | null; url?: string | URL; error?: unknown }) => {
      console.warn("[tiles3d-debug] load error", {
        url: String(event.url ?? runtimeState.tilesetUrl),
        error: String(event.error),
      });
      if (TILE_MEMORY_ALLOCATION_ERROR.test(String(event.error))) {
        runtimeState.allocationFailed = true;
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
      dependencies.notifyRequestStateChange();
      dependencies.maybeEnableShadowSelection();
    };

  const handleViewStart: ThreeTilesRuntimeServices["handleViewStart"] = () => {
    runtimeState.motionCoverageDue = false;
    dependencies.applyRequestConcurrency();
    // Camera movement is not a new loading session. Keep the reached admission
    // stage as well as the displayed mesh cut; only new targets reset staging.
    if (runtimeState.meshAuditTimer !== null)
      clearTimeout(runtimeState.meshAuditTimer);
    runtimeState.meshAuditTimer = null;
    for (const tile of runtimeState.tiles?.loadingTiles ?? [])
      runtimeState.tiles?.markTileUsed(tile);
    // Decision: MOTION-PAUSE-20260909 in shadow-simulation/three/TILED_SHADOW_PAGES.md.
    // Pause queue admission, never abort reusable work on pointer-down. The
    // settled demand sweep removes only work outside receivers AND corridors.
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
      // Coalesce continuous motion into one bounded latest-camera audit per
      // interval. A trailing debounce starves coverage until the pointer stops.
      // No traversal runs in the input handler; network/worker queues continue.
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

  const attachment = createThreeTilesRuntimeAttachment(runtimeState, {
    ...dependencies,
    clearTelemetry: () => telemetryTiles.clear(),
    getRetainedMeshAncestors: () => retainedMeshAncestors,
    handleDownloadStart,
    handleLoadError,
    handleModelDispose,
    handleModelLoad,
    handleTilesetLoad,
    handleTilesLoadEnd,
    handleUpdateAfter,
    handleViewEnd,
    handleViewStart,
    localTelemetry,
    noteTileActivity,
    scheduleMotionCoverage,
  });
  let publishedNativeFrontier = new Set<Tile>();
  const update: ThreeTilesRuntimeServices["update"] = (
    frame: SharedThreeSceneFrame
  ) => {
    if (
      !runtimeState.runtimeVisible ||
      !runtimeState.tiles ||
      !runtimeState.map
    )
      return;
    // Keep drawing the retained cut at native resolution. While input is
    // active, only a bounded coverage traversal admits missing coarse tiles;
    // moveend immediately runs the full requested-error audit again.
    if (runtimeState.options.providesTerrain && runtimeState.map.isMoving?.()) {
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
      if (runtimeState.options.providesTerrain) {
        retainedMeshAncestors = getRetainedMeshAncestors(
          runtimeState.displayedMeshFrontier,
          runtimeState.requestedErrorTarget,
          dependencies.isTileInMainView,
          dependencies.getTileScreenError
        );
      }
      if (runtimeState.options.providesTerrain)
        attachment.updateDeferredMaterials();
      if (runtimeState.mainViewProjectionChanged)
        runtimeState.meshBaseCoverageReady = false;
      // Refresh both pending jobs AND cached candidates before the upstream
      // admission/eviction sort; a finished old query is not a priority cache.
      if (
        runtimeState.options.providesTerrain &&
        runtimeState.mainViewProjectionChanged
      ) {
        for (const tile of (runtimeState.tiles.lruCache as RuntimeLruCache)
          .itemList)
          dependencies.assignTilePriority(tile as RuntimeTile);
      }
      const completingShadowTraversal =
        runtimeState.shadowSelectionNeedsTraversal;
      runtimeState.queuedThisTraversal.clear();
      const previousTraversal = runtimeState.tiles.frameCount;
      // Motion is a sparse coverage audit, not a refinement pass. Keep a
      // small hierarchy slice so newly exposed gaps can fill without turning
      // pointer frames into long synchronous tree walks.
      runtimeState.tiles.maxTilesProcessed = runtimeState.map.isMoving?.()
        ? 8
        : 64;
      runtimeState.tiles.update();
      if (runtimeState.map?.isMoving?.())
        for (const tile of runtimeState.tiles.loadingTiles)
          runtimeState.tiles.markTileUsed(tile);
      // A queue paused by memory/backlog admission can retain work after its
      // concurrency recovers. Explicitly kick every origin after the bounded
      // traversal; tryRunJobs() is idempotent at the configured limit.
      if (
        !runtimeState.memoryAdmissionPaused &&
        runtimeState.tiles.downloadQueue.maxJobsPerOrigin > 0 &&
        runtimeState.tiles.stats.queued > 0 &&
        runtimeState.tiles.stats.downloading === 0
      )
        dependencies.runDownloadQueues();
      // Snapshot upstream's pass result before publishing the persistent
      // union below. The next receiver mask is derived only from pass 1;
      // pass-2 casters never recursively extend the requested corridor.
      const traversalFrontier = new Set(runtimeState.tiles.visibleTiles);
      // A traversal frame or observer-camera change does not alter a
      // sun-direction corridor. Loaded/disposed tile bounds invalidate only
      // intersecting memoized regions in their lifecycle handlers; the
      // runtime placement and sun direction retain the conservative full
      // invalidation paths.
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
            model && dependencies.readModelWorldBounds(model, new THREE.Box3());
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
        // Native LOD2 uses the same receiver/caster split as mesh corridors.
        // Re-evaluate against the observer, never the sun camera's tile set.
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
        (runtimeState.tiles.frameCount !== previousTraversal ||
          runtimeState.mainViewProjectionChanged ||
          completingShadowTraversal)
      ) {
        const loadedViewportCut = collectLoadedMeshReceiverCandidates(
          runtimeState.tiles.rootTileset.root,
          runtimeState.requestedErrorTarget,
          Number.POSITIVE_INFINITY,
          dependencies.isTileInMainView,
          dependencies.getTileScreenError,
          undefined,
          undefined,
          attachment.isDeferredMaterialReady,
          retainedMeshAncestors
        );
        runtimeState.lastLoadedViewportCutSize = loadedViewportCut.size;
        runtimeState.displayedMeshFrontier = retainMeshDetailFrontier({
          previous: runtimeState.displayedMeshFrontier,
          proposed: loadedViewportCut,
          requestedError: runtimeState.requestedErrorTarget,
          inView: dependencies.isTileInMainView,
          errorPixels: dependencies.getTileScreenError,
        });
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
            ])
          : new Set(runtimeState.displayedMeshFrontier);
        for (const tile of new Set([...traversalFrontier, ...displayed])) {
          // Publish ready replacements directly: no tile fade/crossfade and no
          // animated opacity. Layer opacity remains a separate user setting.
          const visible = displayed.has(tile);
          const model = (tile as RuntimeTile).engineData?.scene;
          if (model)
            setTileShadowRole(model, {
              receiver: runtimeState.shadowView
                ? runtimeState.committedMeshReceiverFrontier.has(tile)
                : visible,
              caster: runtimeState.shadowView
                ? runtimeState.committedMeshCasterFrontier.has(tile)
                : visible,
            });
          if (visible === runtimeState.tiles.visibleTiles.has(tile)) continue;
          runtimeState.tiles.setTileActive(tile, visible);
          runtimeState.tiles.setTileVisible(tile, visible);
          const traversal = (tile as RuntimeTile).traversal;
          traversal.active = visible;
          traversal.visible = visible;
          traversal.wasSetActive = visible;
          traversal.wasSetVisible = visible;
          if (visible) runtimeState.tiles.markTileUsed(tile);
        }
      }
      runtimeState.lastMainViewConverged = dependencies.mainViewConverged();
      const hadBaseCoverage = runtimeState.meshBaseCoverageReady;
      runtimeState.meshBaseCoverageReady =
        dependencies.mainViewWithinErrorFactor(
          initialMeshLoadError(runtimeState.requestedErrorTarget) /
            runtimeState.effectiveErrorTarget,
          false
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
        dependencies.sweepSettledMeshDemand();
        dependencies.scheduleSettledMeshAudit();
      }
    } catch (error) {
      if (TILE_MEMORY_ALLOCATION_ERROR.test(String(error))) {
        runtimeState.allocationFailed = true;
        dependencies.applyRequestConcurrency();
      }
      console.error("[tiles3d] update failed:", error);
    }
    dependencies.prioritizeQueuedTiles();

    // Keep rendering while the tile pipeline has work. Queued downloads
    // only count while downloads run; the backoff and terrain listeners
    // wake the loop once they may start.
    const { stats } = runtimeState.tiles;
    const processNodeQueue = runtimeState.tiles
      .processNodeQueue as typeof runtimeState.tiles.processNodeQueue & {
      items: unknown[];
      currJobs: number;
    };
    if (
      !runtimeState.memoryAdmissionPaused &&
      ((stats.queued > 0 &&
        runtimeState.tiles.downloadQueue.maxJobsPerOrigin > 0) ||
        stats.downloading > 0 ||
        stats.parsing > 0 ||
        processNodeQueue.items.length > 0 ||
        processNodeQueue.currJobs > 0 ||
        runtimeState.viewQualityAuditPasses > 0)
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

  const dispose: ThreeTilesRuntimeServices["dispose"] = attachment.dispose;
  return {
    handleModelLoad,
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
