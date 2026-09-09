import { TilesRenderer } from "3d-tiles-renderer";
import {
  DownloadPriorityQueue,
  LRUCache,
  PriorityQueue,
  type Tile,
} from "3d-tiles-renderer/core";
import {
  GLTFExtensionsPlugin,
  ImplicitTilingPlugin,
  ReorientationPlugin,
  UpdateOnChangePlugin,
} from "3d-tiles-renderer/plugins";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

import { degToRadNumeric } from "@carma-units";

import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";
import { applyShadowReceiverMask } from "../../core/shadow-receiver-mask";
import { Gltf1UpgradePlugin } from "./gltf1-upgrade-plugin";
import type { SharedThreeSceneFrame } from "./shared-three-scene-layer";
import { subscribeSharedThreeTerrainLoading } from "./shared-three-terrain-registry";
import { readOrientedTileBounds } from "./three-tiles-bounds";
import {
  TILES_LOAD_POLICY,
  TILE_MEMORY_ALLOCATION_ERROR,
  initialMeshLoadError,
} from "./three-tiles-load-policy";
import {
  collectLoadedMeshReceiverCandidates,
  isMeshCoveredByLoadedChildren,
  retainMeshDetailFrontier,
  shouldDeferMeshRefinement,
} from "./three-tiles-mesh-frontier";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import type {
  RuntimeLruCache,
  RuntimeTile,
  RuntimeTilesRenderer,
} from "./three-tiles-runtime-types";
import {
  FAILED_LOADING_STATE,
  UNLOADED_LOADING_STATE,
  buildPrimitiveOutlinePlugin,
  resolveTileContentUrl,
  tilesCacheUnloadPriorityCallback,
  tilesNodeQueuePriorityCallback,
  tilesQueuePriorityCallback,
} from "./three-tiles-runtime-vendor";
import {
  KICKSTART_INTERVAL_MS,
  MESH_EVICTION_BATCH_SIZE,
  MESH_MOTION_COVERAGE_INTERVAL_MS,
  MESH_PARSE_CONCURRENCY,
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
    | "tileViewFrustum"
    | "lastMainViewConverged"
    | "orientationGroup"
    | "disposed"
    | "requestBackoffTimer"
    | "clayMaterialStates"
    | "litTextureMaterialStates"
    | "tileDebugOverlay"
  >,
  dependencies: Pick<
    ThreeTilesRuntimeServices,
    | "getTileDebugProgress"
    | "refreshRenderedMaterials"
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
  let requestCancellationTimer: ReturnType<typeof setTimeout> | null = null;
  const supersededRequests = new Set<Tile>();
  const cancelSupersededRequests = () => {
    requestCancellationTimer = null;
    const tiles = runtimeState.tiles;
    if (!tiles || runtimeState.disposed) {
      supersededRequests.clear();
      return;
    }
    // Decision: CAMERA-REQUEST-PREEMPTION-20260909 in
    // libraries/mapping/shadow-simulation/three/TILED_SHADOW_PAGES.md.
    // Native LRU removal aborts fetch and removes queued parse work together.
    // Yield between batches; never dispose a completed receiver/caster payload.
    let count = 0;
    for (const tile of supersededRequests) {
      supersededRequests.delete(tile);
      if (
        tiles.loadingTiles.has(tile) &&
        !tiles.visibleTiles.has(tile) &&
        !(tile as RuntimeTile).engineData?.scene
      )
        tiles.lruCache.remove(tile);
      if (++count >= MESH_EVICTION_BATCH_SIZE) break;
    }
    if (supersededRequests.size > 0) {
      requestCancellationTimer = setTimeout(cancelSupersededRequests, 0);
      return;
    }
    dependencies.notifyRequestStateChange();
    runtimeState.motionCoverageDue = true;
    dependencies.resetDeferredTiles();
    dependencies.requestShadowSelectionRefresh();
    tiles.dispatchEvent({ type: "needs-update" });
    dependencies.requestRender();
  };

  const handleModelLoad: ThreeTilesRuntimeServices["handleModelLoad"] =
    (event: { scene?: THREE.Object3D; tile?: Tile; url?: string }) => {
      if (event.tile) {
        dependencies.getTileDebugProgress(event.tile).loadedAt ??=
          performance.now();
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
        dependencies.refreshRenderedMaterials(event.scene);
        const bounds = dependencies.readModelWorldBounds(
          event.scene,
          new THREE.Box3()
        );
        if (!bounds.isEmpty()) changedBounds.push(bounds.clone());
      }
      dependencies.invalidateShadowRegionRevisions(changedBounds);
      runtimeState.options.onContentChanged?.(
        changedBounds,
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
      supersededRequests.add(tile);
    if (requestCancellationTimer === null && supersededRequests.size > 0)
      requestCancellationTimer = setTimeout(cancelSupersededRequests, 0);
    // Abort only the old pending generation, not the published mesh cut,
    // corridor membership or their shadow textures. Later motion audits admit
    // new demand without repeatedly aborting those new requests.
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

  const onAdd: ThreeTilesRuntimeServices["onAdd"] = (
    mapInstance: MaplibreMap
  ) => {
    runtimeState.map = mapInstance;
    if (runtimeState.tiles) return;

    console.debug("[tiles3d-debug] runtime added", {
      tilesetUrl: runtimeState.tilesetUrl,
      providesTerrain: runtimeState.options.providesTerrain === true,
    });

    runtimeState.tiles = new TilesRenderer(
      runtimeState.tilesetUrl
    ) as RuntimeTilesRenderer;
    const tileCache = new LRUCache();
    tileCache.unloadPriorityCallback = (
      runtimeState.options.providesTerrain
        ? // Upstream uses this comparator for admission too (ascending), then
          // negates it for eviction. Download/parse queues pop from the end.
          (first: Tile, second: Tile) =>
            -tilesQueuePriorityCallback(first, second)
        : tilesCacheUnloadPriorityCallback
    ) as typeof tileCache.unloadPriorityCallback;
    const downloadQueue = new DownloadPriorityQueue();
    downloadQueue.priorityCallback = tilesQueuePriorityCallback;
    const parseQueue = new PriorityQueue();
    parseQueue.priorityCallback = tilesQueuePriorityCallback;
    const processNodeQueue = new PriorityQueue();
    processNodeQueue.priorityCallback = tilesNodeQueuePriorityCallback;
    runtimeState.tiles.lruCache = tileCache;
    runtimeState.tiles.downloadQueue = downloadQueue;
    runtimeState.tiles.parseQueue = parseQueue;
    runtimeState.tiles.processNodeQueue = processNodeQueue;
    // D2: admission registers a predicted size so the cache fills before
    // downloads finish; measured content carries the resident overhead.
    const calculateBytesUsed = runtimeState.tiles.calculateBytesUsed.bind(
      runtimeState.tiles
    );
    runtimeState.tiles.calculateBytesUsed = (tile, scene) => {
      const measured = calculateBytesUsed(tile, scene);
      if (measured !== null && measured > 0) {
        return Math.round(measured * TILES_LOAD_POLICY.residentOverhead);
      }
      return runtimeState.bytesPredictor.predict({
        url: resolveTileContentUrl(tile),
        geometricError: tile.geometricError,
        isExternalTileset: tile.internal.hasUnrenderableContent,
      });
    };
    // D1: the deferral decision rides on upstream's per-frame view error.
    const calculateTileViewErrorWithPlugin =
      runtimeState.tiles.calculateTileViewErrorWithPlugin.bind(
        runtimeState.tiles
      );
    runtimeState.tiles.calculateTileViewErrorWithPlugin = (tile, target) => {
      dependencies.recordTileIteration(tile);
      calculateTileViewErrorWithPlugin(tile, target);
      const runtimeTile = tile as RuntimeTile;
      runtimeTile.shadowReceiverCenterness = undefined;
      runtimeTile.shadowLightFacing = undefined;
      runtimeTile.shadowReceiverCurrent = undefined;
      if (
        runtimeState.shadowSelectionEnabled &&
        runtimeState.shadowReceiverMask &&
        !runtimeState.mainViewSourceTiles.has(tile) &&
        !target.inView
      ) {
        const bounds = runtimeTile.engineData?.boundingVolume;
        if (bounds?.getAABB) {
          readOrientedTileBounds(
            bounds,
            runtimeState.tileBoundingBox,
            runtimeState.tileBoundsTransform
          );
          const matchedCurrent = applyShadowReceiverMask(
            runtimeState.shadowReceiverMask,
            runtimeState.tileBoundingBox,
            target,
            runtimeState.shadowReceiverMatch,
            tile.geometricError,
            runtimeState.effectiveErrorTarget,
            runtimeState.tileBoundsTransform,
            { key: tile, parent: tile.parent ?? undefined }
          );
          if (matchedCurrent) {
            runtimeTile.shadowReceiverCenterness =
              runtimeState.shadowReceiverMatch.receiverCenterness;
            runtimeTile.shadowLightFacing =
              runtimeState.shadowReceiverMatch.lightFacing;
            runtimeTile.shadowReceiverCurrent = true;
          }
        }
      }
      dependencies.applyTileDeferral(tile, target.inView);
    };
    const queueTileForDownload = runtimeState.tiles.queueTileForDownload.bind(
      runtimeState.tiles
    );
    runtimeState.tiles.queueTileForDownload = (tile) => {
      const tiles = runtimeState.tiles;
      if (!tiles) return;
      if (runtimeState.memoryAdmissionPaused) return;
      if (
        tile.internal.loadingState !== UNLOADED_LOADING_STATE ||
        runtimeState.queuedThisTraversal.has(tile)
      )
        return;
      const runtimeTile = tile as RuntimeTile;
      // A payload freed after proven child replacement must not immediately
      // re-enter loadAncestors' queue. Its hierarchy/metadata remains intact.
      if (
        runtimeState.options.providesTerrain &&
        isMeshCoveredByLoadedChildren(tile, tiles.visibleTiles)
      )
        return;
      if (
        runtimeState.options.providesTerrain &&
        dependencies.isTileInMainView(runtimeTile) &&
        shouldDeferMeshRefinement(
          tile,
          runtimeState.map?.isMoving?.() || !runtimeState.meshBaseCoverageReady
            ? initialMeshLoadError(runtimeState.requestedErrorTarget)
            : runtimeState.requestedErrorTarget,
          (parent) => dependencies.getTileScreenError(parent as RuntimeTile)
        )
      )
        return;
      // D8: a pending retry or an exhausted budget keeps the parent as the
      // fallback instead of re-requesting the tile every frame.
      if (runtimeState.tileRetries.isBlocked(tile)) return;
      // D7: REPLACE content that refines unconditionally is never displayed.
      if (
        tile.refine === "REPLACE" &&
        (tile as RuntimeTile).traversal?.unconditionallyRefine === true &&
        tile.internal.hasRenderableContent
      ) {
        return;
      }
      dependencies.assignTilePriority(runtimeTile);
      runtimeState.queuedThisTraversal.add(tile);
      const progress = dependencies.getTileDebugProgress(tile);
      progress.queuedAt ??= performance.now();
      queueTileForDownload(tile);
    };
    // 3D Tiles 1.1 implicit tiling (template URIs) is plugin-based
    runtimeState.tiles.registerPlugin(new ImplicitTilingPlugin());
    runtimeState.tiles.registerPlugin(new UpdateOnChangePlugin());
    // Mesh 2020 ships glTF 1.0 b3dm — upgrade payloads on the fly. The raw
    // response feeds the wire-size sampling of the request concurrency.
    runtimeState.tiles.registerPlugin(
      new Gltf1UpgradePlugin({ onResponse: dependencies.handleWireBytes })
    );
    // Draco-compressed glTF payloads need an explicit decoder
    runtimeState.dracoLoader = new DRACOLoader();
    runtimeState.dracoLoader.setDecoderPath(
      "https://www.gstatic.com/draco/versioned/decoders/1.5.6/"
    );
    runtimeState.tiles.registerPlugin(
      new GLTFExtensionsPlugin({
        dracoLoader: runtimeState.dracoLoader,
        plugins: [
          (parser: unknown) =>
            buildPrimitiveOutlinePlugin(parser, {
              color: runtimeState.outlineColor,
              opacity: runtimeState.outlineOpacity,
            }),
        ],
      })
    );
    dependencies.syncTileDebugOverlay();
    // Reorient the ECEF tileset into the local scene frame at the
    // layer origin: ENU with +Y up, north toward -Z — matching the
    // point cloud layers (x east, y up, z south).
    runtimeState.tiles.registerPlugin(
      new ReorientationPlugin({
        lat: degToRadNumeric(runtimeState.originLngLat[1]),
        lon: degToRadNumeric(runtimeState.originLngLat[0]),
        height: 0,
      })
    );

    runtimeState.tiles.loadSiblings = false;
    runtimeState.tiles.loadAncestors = true;
    runtimeState.tiles.displayActiveTiles = true;
    runtimeState.tiles.parseQueue.maxJobs = MESH_PARSE_CONCURRENCY;
    runtimeState.normalParseConcurrency = MESH_PARSE_CONCURRENCY;
    dependencies.applyRequestConcurrency();
    // processNodeQueue expands tileset metadata on the browser thread. A
    // large value stalls input and delays the first publish even though it
    // looks like parallelism; network downloads retain their independent,
    // dynamically tuned concurrency above.
    runtimeState.tiles.processNodeQueue.maxJobs = 4;
    // Keep synchronous hierarchy expansion bounded per frame. The upstream
    // default is 250; processing 1,000 nodes here delayed both input and the
    // first coarse viewport publication. Sixty-four is enough to advance a
    // broad cut while yielding regularly to MapLibre presentation.
    runtimeState.tiles.maxTilesProcessed = 64;
    dependencies.applyCacheBudget();
    runtimeState.effectiveErrorTarget =
      dependencies.initialEffectiveErrorTarget();
    runtimeState.tiles.errorTarget = runtimeState.effectiveErrorTarget;
    runtimeState.offsetGroup.add(runtimeState.tiles.group);

    // Request frames until the root tileset arrived (`load-tileset`) or
    // tile work started; a hidden runtime does not ask for frames.
    runtimeState.kickstartTimer = window.setInterval(() => {
      if (
        !runtimeState.tiles ||
        runtimeState.tiles.stats.downloading > 0 ||
        runtimeState.tiles.stats.parsing > 0
      ) {
        dependencies.clearKickstartTimer();
        return;
      }
      if (!runtimeState.runtimeVisible) return;
      dependencies.requestRender();
    }, KICKSTART_INTERVAL_MS);
    runtimeState.tiles.addEventListener(
      "needs-update",
      dependencies.requestRender
    );
    runtimeState.tiles.addEventListener("load-tileset", handleTilesetLoad);
    runtimeState.tiles.addEventListener("update-after", handleUpdateAfter);
    runtimeState.tiles.addEventListener("load-model", handleModelLoad);
    runtimeState.tiles.addEventListener("dispose-model", handleModelDispose);
    runtimeState.tiles.addEventListener("load-error", handleLoadError);
    runtimeState.tiles.addEventListener("tiles-load-end", handleTilesLoadEnd);
    runtimeState.unsubscribeTerrainLoading = subscribeSharedThreeTerrainLoading(
      runtimeState.map,
      () => {
        dependencies.applyRequestConcurrency();
        if (
          runtimeState.tiles &&
          runtimeState.tiles.downloadQueue.maxJobsPerOrigin > 0
        ) {
          dependencies.runDownloadQueues();
        }
        runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
        dependencies.requestRender();
      }
    );
    runtimeState.map.on(MAPLIBRE_EVENT.MOVE_START, handleViewStart);
    runtimeState.map.on(MAPLIBRE_EVENT.MOVE, scheduleMotionCoverage);
    runtimeState.map.on(MAPLIBRE_EVENT.MOVE_END, handleViewEnd);
    runtimeState.map.on(MAPLIBRE_EVENT.RESIZE, handleViewEnd);
    runtimeState.map.on(
      MAPLIBRE_EVENT.WEBGL_CONTEXT_LOST,
      dependencies.handleContextLost
    );
    runtimeState.map.on(
      MAPLIBRE_EVENT.WEBGL_CONTEXT_RESTORED,
      dependencies.handleContextRestored
    );
    document.addEventListener(
      "visibilitychange",
      dependencies.handleVisibilityChange
    );
  };

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
          dependencies.getTileScreenError
        );
        runtimeState.lastLoadedViewportCutSize = loadedViewportCut.size;
        runtimeState.displayedMeshFrontier = retainMeshDetailFrontier({
          previous: runtimeState.displayedMeshFrontier,
          proposed: loadedViewportCut,
          requestedError: runtimeState.requestedErrorTarget,
          inView: dependencies.isTileInMainView,
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
          const visible = displayed.has(tile);
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
      runtimeState.meshBaseCoverageReady =
        dependencies.mainViewWithinErrorFactor(
          initialMeshLoadError(runtimeState.requestedErrorTarget) /
            runtimeState.effectiveErrorTarget,
          false
        );
      if (performance.now() - runtimeState.lastRuntimeDebugAt >= 1_000) {
        runtimeState.lastRuntimeDebugAt = performance.now();
        const residentTiles = [
          ...(runtimeState.tiles.lruCache as RuntimeLruCache).itemList,
        ] as RuntimeTile[];
        const loadedTiles = residentTiles.filter(
          (tile) => tile.engineData?.scene
        );
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
            viewportCut: runtimeState.lastLoadedViewportCutSize,
            retainedViewport: runtimeState.displayedMeshFrontier.size,
            corridorTiles: runtimeState.committedMeshCasterFrontier.size,
            loadedCorridorTiles: loadedTiles.filter(
              (tile) => tile.shadowReceiverCurrent === true
            ).length,
            shadowSelectionEnabled: runtimeState.shadowSelectionEnabled,
            receiverCount: runtimeState.shadowReceiverMask?.sourceCount ?? 0,
            loadedModels: loadedTiles.length,
            traversalInFrustum: loadedTiles.filter(
              (tile) => tile.traversal?.inFrustum
            ).length,
            explicitMainFrustum: loadedTiles.filter((tile) => {
              const bounds = tile.engineData?.boundingVolume;
              return (
                bounds?.intersectsFrustum(runtimeState.tileViewFrustum) ?? false
              );
            }).length,
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
      }
      dependencies.syncTileDebugOverlay();
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

  const dispose: ThreeTilesRuntimeServices["dispose"] = () => {
    runtimeState.disposed = true;
    if (requestCancellationTimer !== null)
      clearTimeout(requestCancellationTimer);
    requestCancellationTimer = null;
    supersededRequests.clear();
    if (runtimeState.meshAuditTimer !== null)
      clearTimeout(runtimeState.meshAuditTimer);
    runtimeState.meshAuditTimer = null;
    if (runtimeState.motionCoverageTimer !== null)
      clearTimeout(runtimeState.motionCoverageTimer);
    runtimeState.motionCoverageTimer = null;
    dependencies.clearErrorTargetTimer();
    dependencies.clearHiddenWipeTimer();
    dependencies.clearKickstartTimer();
    dependencies.resetDeferredTiles();
    if (runtimeState.requestBackoffTimer) {
      window.clearTimeout(runtimeState.requestBackoffTimer);
      runtimeState.requestBackoffTimer = 0;
    }
    runtimeState.map?.off(MAPLIBRE_EVENT.MOVE_START, handleViewStart);
    runtimeState.map?.off(MAPLIBRE_EVENT.MOVE, scheduleMotionCoverage);
    runtimeState.map?.off(MAPLIBRE_EVENT.MOVE_END, handleViewEnd);
    runtimeState.map?.off(MAPLIBRE_EVENT.RESIZE, handleViewEnd);
    runtimeState.map?.off(
      MAPLIBRE_EVENT.WEBGL_CONTEXT_LOST,
      dependencies.handleContextLost
    );
    runtimeState.map?.off(
      MAPLIBRE_EVENT.WEBGL_CONTEXT_RESTORED,
      dependencies.handleContextRestored
    );
    document.removeEventListener(
      "visibilitychange",
      dependencies.handleVisibilityChange
    );
    runtimeState.unsubscribeTerrainLoading?.();
    runtimeState.unsubscribeTerrainLoading = null;
    runtimeState.tiles?.removeEventListener(
      "needs-update",
      dependencies.requestRender
    );
    runtimeState.tiles?.removeEventListener("load-tileset", handleTilesetLoad);
    runtimeState.tiles?.removeEventListener("update-after", handleUpdateAfter);
    runtimeState.tiles?.removeEventListener("load-model", handleModelLoad);
    runtimeState.tiles?.removeEventListener(
      "dispose-model",
      handleModelDispose
    );
    runtimeState.tiles?.removeEventListener("load-error", handleLoadError);
    runtimeState.tiles?.removeEventListener(
      "tiles-load-end",
      handleTilesLoadEnd
    );
    runtimeState.cameraSet?.dispose();
    runtimeState.cameraSet = null;
    runtimeState.tileRetries.dispose();
    // The material states are keyed by mesh, so release them directly
    // instead of searching the scene graph for their meshes.
    for (const [mesh, state] of runtimeState.clayMaterialStates) {
      dependencies.disposeClayState(mesh, state);
    }
    for (const [mesh, state] of runtimeState.litTextureMaterialStates) {
      dependencies.disposeLitTextureState(mesh, state);
    }
    dependencies.restoreShadowSides();
    runtimeState.tileDebugOverlay?.dispose();
    runtimeState.tileDebugOverlay = null;
    runtimeState.tiles?.dispose();
    runtimeState.tiles = null;
    runtimeState.dracoLoader?.dispose();
    runtimeState.dracoLoader = null;
    runtimeState.orientationGroup.clear();
    runtimeState.map = null;
  };
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
    onAdd,
    update,
    setVisible,
    setHeightOffset,
    hasRenderableContent,
    dispose,
  };
}
