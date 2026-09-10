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
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

import { degToRadNumeric } from "@carma-units";

import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";
import { applyShadowReceiverMask } from "../../core/shadow-receiver-mask";
import { Gltf1UpgradePlugin } from "./gltf1-upgrade-plugin";
import { subscribeSharedThreeTerrainLoading } from "./shared-three-terrain-registry";
import { readOrientedTileBounds } from "./three-tiles-bounds";
import {
  TILES_LOAD_POLICY,
  initialMeshLoadError,
} from "./three-tiles-load-policy";
import {
  isMeshCoveredByLoadedChildren,
  shouldDeferMeshRefinement,
} from "./three-tiles-mesh-frontier";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import {
  KICKSTART_INTERVAL_MS,
  MESH_PARSE_CONCURRENCY,
  TILE_METADATA_DOWNLOAD_CONCURRENCY,
  TILE_METADATA_PARSE_CONCURRENCY,
} from "./three-tiles-runtime-config";
import type {
  RuntimePriorityQueue,
  RuntimeTile,
  RuntimeTilesRenderer,
} from "./three-tiles-runtime-types";
import {
  buildPrimitiveOutlinePlugin,
  resolveTileContentUrl,
  tilesCacheUnloadPriorityCallback,
  tilesNodeQueuePriorityCallback,
  tilesQueuePriorityCallback,
  UNLOADED_LOADING_STATE,
} from "./three-tiles-runtime-vendor";
import { TilesetDeferredMaterialsPlugin } from "./tileset-deferred-materials-plugin";
import { TilesetHierarchyPlugin } from "./tileset-hierarchy-plugin";

type ThreeTilesRuntimeAttachmentState = Pick<
  ThreeTilesRuntimeState,
  | "bytesPredictor"
  | "cameraSet"
  | "clayMaterialStates"
  | "disposed"
  | "dracoLoader"
  | "effectiveErrorTarget"
  | "kickstartTimer"
  | "litTextureMaterialStates"
  | "mainViewProjectionChanged"
  | "mainViewSourceTiles"
  | "map"
  | "memoryAdmissionPaused"
  | "meshAuditTimer"
  | "meshBaseCoverageReady"
  | "motionCoverageTimer"
  | "normalParseConcurrency"
  | "offsetGroup"
  | "options"
  | "orientationGroup"
  | "originLngLat"
  | "outlineColor"
  | "outlineOpacity"
  | "queuedThisTraversal"
  | "requestBackoffTimer"
  | "requestedErrorTarget"
  | "runtimeVisible"
  | "shadowReceiverMask"
  | "shadowReceiverMatch"
  | "shadowSelectionEnabled"
  | "tileBoundingBox"
  | "tileBoundsTransform"
  | "tileBoundsVisible"
  | "tileDebugOverlay"
  | "tileRetries"
  | "tiles"
  | "tilesetUrl"
  | "unsubscribeTerrainLoading"
>;

type ThreeTilesRuntimeAttachmentDependencies = Pick<
  ThreeTilesRuntimeServices,
  | "applyCacheBudget"
  | "applyMaterialFlags"
  | "applyRequestConcurrency"
  | "applyTileDeferral"
  | "assignTilePriority"
  | "clearErrorTargetTimer"
  | "clearHiddenWipeTimer"
  | "clearKickstartTimer"
  | "disposeClayState"
  | "disposeLitTextureState"
  | "getTileDebugProgress"
  | "getTileScreenError"
  | "handleContextLost"
  | "handleContextRestored"
  | "handleLoadError"
  | "handleModelDispose"
  | "handleModelLoad"
  | "handleTilesetLoad"
  | "handleTilesLoadEnd"
  | "handleUpdateAfter"
  | "handleViewEnd"
  | "handleViewStart"
  | "handleVisibilityChange"
  | "handleWireBytes"
  | "initialEffectiveErrorTarget"
  | "isTileInMainView"
  | "recordTileIteration"
  | "refreshRenderedMaterials"
  | "requestRender"
  | "resetDeferredTiles"
  | "restoreShadowSides"
  | "runDownloadQueues"
  | "scheduleMotionCoverage"
  | "syncTileDebugOverlay"
> & {
  clearTelemetry: () => void;
  getRetainedMeshAncestors: () => ReadonlySet<Tile>;
  handleDownloadStart: (event: { tile: Tile }) => void;
  localTelemetry: boolean;
  noteTileActivity: (tile: Tile) => void;
};

export function createThreeTilesRuntimeAttachment(
  runtimeState: ThreeTilesRuntimeAttachmentState,
  dependencies: ThreeTilesRuntimeAttachmentDependencies
) {
  const deferredMaterials = new TilesetDeferredMaterialsPlugin({
    inView: dependencies.isTileInMainView,
    onPromoted: (tile, scene) => {
      dependencies.refreshRenderedMaterials(scene);
      runtimeState.mainViewProjectionChanged = true;
      runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
      runtimeState.options.onContentChanged?.([], [scene]);
      dependencies.requestRender();
    },
    onError: (tile, error) => {
      if (runtimeState.tileBoundsVisible)
        dependencies.getTileDebugProgress(tile).lastError = String(error);
    },
  });
  const guardedPayloadQueues = new WeakSet<PriorityQueue>();
  let parseWakeTimer: ReturnType<typeof setTimeout> | null = null;
  let metadataWakeTimer: ReturnType<typeof setTimeout> | null = null;
  const metadataDownloads = new DownloadPriorityQueue();
  metadataDownloads.maxJobsPerOrigin = TILE_METADATA_DOWNLOAD_CONCURRENCY;
  metadataDownloads.priorityCallback = tilesQueuePriorityCallback;
  const metadataParsing = new PriorityQueue();
  metadataParsing.maxJobs = TILE_METADATA_PARSE_CONCURRENCY;
  metadataParsing.priorityCallback = tilesNodeQueuePriorityCallback;
  metadataParsing.scheduleJobRun = () => {
    if (metadataWakeTimer !== null || runtimeState.disposed) return;
    metadataWakeTimer = setTimeout(() => {
      metadataWakeTimer = null;
      if (!runtimeState.disposed) metadataParsing.tryRunJobs();
    }, 0);
  };

  const guardPayloadQueue = (nativeQueue: PriorityQueue) => {
    if (guardedPayloadQueues.has(nativeQueue)) return;
    guardedPayloadQueues.add(nativeQueue);
    const queue = nativeQueue as RuntimePriorityQueue;
    const run = queue.tryRunJobs.bind(queue);
    queue.tryRunJobs = () => {
      if (!runtimeState.options.providesTerrain) return run();
      if (runtimeState.map?.isMoving?.()) return;
      if (runtimeState.meshBaseCoverageReady) return run();
      // Native PriorityQueue has no eligibility predicate. Partition only its
      // scheduling list synchronously; promises, callbacks and native abort
      // ownership stay registered. Restore parked entries before yielding.
      // Decision: MOTION-PAUSE-20260909 in shadow-simulation/three/TILED_SHADOW_PAGES.md.
      const parked: Tile[] = [];
      const ready: Tile[] = [];
      const retainedMeshAncestors = dependencies.getRetainedMeshAncestors();
      for (const tile of queue.items) {
        const required =
          dependencies.isTileInMainView(tile as RuntimeTile) &&
          !shouldDeferMeshRefinement(
            tile,
            initialMeshLoadError(runtimeState.requestedErrorTarget),
            (parent) => dependencies.getTileScreenError(parent as RuntimeTile),
            retainedMeshAncestors
          );
        (required ? ready : parked).push(tile);
      }
      queue.items = ready;
      try {
        run();
      } finally {
        queue.items.push(...parked);
      }
    };
  };

  const onAdd = (mapInstance: MaplibreMap) => {
    runtimeState.map = mapInstance;
    if (runtimeState.tiles) return;

    if (dependencies.localTelemetry && runtimeState.tileBoundsVisible)
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
    // Decision: TILE-METADATA-FAST-LANE-20260909 in engines/maplibre/README.md.
    // Preserve upstream ownership/abort handling, but metadata must not wait
    // behind payload downloads or the mesh parse-backlog throttle.
    const addDownload = downloadQueue.add.bind(downloadQueue);
    downloadQueue.add = (url, tile: Tile, callback, signal) => {
      if (tile.internal.hasUnrenderableContent)
        return metadataDownloads.add(url, tile, callback, signal);
      const pending = addDownload(url, tile, callback, signal);
      for (const queue of downloadQueue.originQueues.values())
        guardPayloadQueue(queue);
      return pending;
    };
    const removeDownload = downloadQueue.remove.bind(downloadQueue);
    downloadQueue.remove = (tile) => {
      metadataDownloads.remove(tile);
      removeDownload(tile);
    };
    const hasDownload = downloadQueue.has.bind(downloadQueue);
    downloadQueue.has = (tile) =>
      metadataDownloads.has(tile) || hasDownload(tile);
    const parseQueue = new PriorityQueue();
    parseQueue.priorityCallback = tilesQueuePriorityCallback;
    guardPayloadQueue(parseQueue);
    // Parsing must not wait for an expensive shadow frame to finish before the
    // next two jobs start. Coalesce native wakeups onto a separate browser task;
    // keep bounded concurrency and yield between batches instead of microtasks.
    parseQueue.scheduleJobRun = () => {
      if (parseWakeTimer !== null || runtimeState.disposed) return;
      parseWakeTimer = setTimeout(() => {
        parseWakeTimer = null;
        if (!runtimeState.disposed) parseQueue.tryRunJobs();
      }, 0);
    };
    const processNodeQueue = new PriorityQueue();
    processNodeQueue.priorityCallback = tilesNodeQueuePriorityCallback;
    runtimeState.tiles.lruCache = tileCache;
    runtimeState.tiles.downloadQueue = downloadQueue;
    runtimeState.tiles.parseQueue = parseQueue;
    runtimeState.tiles.processNodeQueue = processNodeQueue;
    const addParseJob = parseQueue.add.bind(parseQueue);
    const removeParseJob = parseQueue.remove.bind(parseQueue);
    parseQueue.remove = (tile) => {
      metadataParsing.remove(tile);
      removeParseJob(tile);
    };
    const hasParseJob = parseQueue.has.bind(parseQueue);
    parseQueue.has = (tile) => metadataParsing.has(tile) || hasParseJob(tile);
    parseQueue.add = (tile: Tile, callback) => {
      const progress = runtimeState.tileBoundsVisible
        ? dependencies.getTileDebugProgress(tile)
        : null;
      if (progress) progress.downloadFinishedAt = performance.now();
      dependencies.noteTileActivity(tile);
      const add = tile.internal.hasUnrenderableContent
        ? metadataParsing.add.bind(metadataParsing)
        : addParseJob;
      return add(tile, async (item) => {
        // Native queue callbacks start in rAF. Yield before metadata/GLTF work
        // so queue admission itself does not run parsing inside a paint callback.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (runtimeState.disposed) return;
        if (progress && runtimeState.tileBoundsVisible)
          progress.parseStartedAt = performance.now();
        try {
          return await callback(item);
        } catch (error) {
          if (progress && runtimeState.tileBoundsVisible)
            progress.lastError = String(error).slice(0, 240);
          throw error;
        } finally {
          if (progress && runtimeState.tileBoundsVisible)
            progress.parseFinishedAt = performance.now();
          dependencies.noteTileActivity(tile);
        }
      });
    };
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
      if (runtimeState.tileBoundsVisible)
        dependencies.recordTileIteration(tile);
      calculateTileViewErrorWithPlugin(tile, target);
      const retainedMeshAncestors = dependencies.getRetainedMeshAncestors();
      if (target.inView && retainedMeshAncestors.has(tile)) {
        // Native REPLACE traversal must reach the retained mixed-LOD cut and
        // discover missing sibling coverage. This affects admission only;
        // publication/coarsening uses getTileScreenError for the real camera.
        target.error = Math.max(
          target.error,
          runtimeState.effectiveErrorTarget + 1
        );
      }
      const runtimeTile = tile as RuntimeTile;
      runtimeTile.shadowReceiverCenterness = undefined;
      runtimeTile.shadowLightFacing = undefined;
      runtimeTile.shadowReceiverCurrent = undefined;
      if (
        runtimeState.shadowSelectionEnabled &&
        runtimeState.shadowReceiverMask &&
        (!runtimeState.options.providesTerrain ||
          (!runtimeState.mainViewSourceTiles.has(tile) && !target.inView))
      ) {
        const bounds = runtimeTile.engineData?.boundingVolume;
        if (bounds?.getAABB) {
          readOrientedTileBounds(
            bounds,
            runtimeState.tileBoundingBox,
            runtimeState.tileBoundsTransform
          );
          const observerInView = target.inView;
          const observerError = target.error;
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
          // A visible LOD2 ancestor can also lead to an offscreen caster.
          // Native camera coverage must not suppress that corridor's demand.
          if (observerInView) {
            target.inView = true;
            target.error = matchedCurrent
              ? Math.max(observerError, target.error)
              : observerError;
          }
          if (matchedCurrent) {
            runtimeTile.shadowReceiverCenterness =
              runtimeState.shadowReceiverMatch.receiverCenterness;
            runtimeTile.shadowLightFacing =
              runtimeState.shadowReceiverMatch.lightFacing;
            runtimeTile.shadowReceiverCurrent = true;
          }
        }
      }
      if (
        !runtimeState.options.providesTerrain &&
        target.inView &&
        !tile.internal.hasRenderableContent &&
        tile.children.length > 0
      ) {
        // Decision: OFFSCREEN-CASTERS-20260910 in
        // libraries/mapping/shadow-simulation/three/TILED_SHADOW_PAGES.md.
        // An implicit-tileset routing node is not an empty coarse surface.
        // Reach actual content before accepting its SSE; otherwise a loaded
        // offscreen leaf never enters the depth cut and its corridor stalls.
        target.error = Math.max(
          target.error,
          runtimeState.effectiveErrorTarget + 1
        );
      }
      const parent = tile.parent;
      if (
        !runtimeState.options.providesTerrain &&
        target.inView &&
        parent?.refine === "ADD" &&
        !parent.internal.hasRenderableContent &&
        parent.geometricError > 0 &&
        tile.geometricError > 0
      ) {
        // Upstream's ADD shortcut scales the child's SSE to its parent and
        // skips the child even when that parent has no content to draw.
        // Cross that shortcut without forcing the child itself to finer LOD.
        target.error = Math.max(
          target.error,
          ((runtimeState.effectiveErrorTarget + 1) * tile.geometricError) /
            parent.geometricError
        );
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
      const retainedMeshAncestors = dependencies.getRetainedMeshAncestors();
      if (
        runtimeState.options.providesTerrain &&
        (isMeshCoveredByLoadedChildren(tile, tiles.visibleTiles) ||
          (retainedMeshAncestors.has(tile) &&
            tile.internal.hasRenderableContent &&
            !tile.internal.hasUnrenderableContent))
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
          (parent) => dependencies.getTileScreenError(parent as RuntimeTile),
          retainedMeshAncestors
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
      if (runtimeState.tileBoundsVisible)
        dependencies.getTileDebugProgress(tile).queuedAt ??= performance.now();
      dependencies.noteTileActivity(tile);
      queueTileForDownload(tile);
    };
    // 3D Tiles 1.1 implicit tiling (template URIs) is plugin-based
    runtimeState.tiles.registerPlugin(new ImplicitTilingPlugin());
    runtimeState.tiles.registerPlugin(new UpdateOnChangePlugin());
    if (runtimeState.options.providesTerrain)
      runtimeState.tiles.registerPlugin(deferredMaterials);
    if (
      runtimeState.options.hierarchyCache !== false &&
      typeof Worker !== "undefined"
    ) {
      runtimeState.tiles.registerPlugin(
        new TilesetHierarchyPlugin(runtimeState.tilesetUrl)
      );
    }
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
          deferredMaterials.createGltfPlugin,
          (parser: unknown) =>
            buildPrimitiveOutlinePlugin(parser, {
              color: runtimeState.outlineColor,
              opacity: runtimeState.outlineOpacity,
            }),
        ],
      })
    );
    if (runtimeState.tileBoundsVisible) dependencies.syncTileDebugOverlay();
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
    runtimeState.tiles.addEventListener(
      "load-tileset",
      dependencies.handleTilesetLoad
    );
    runtimeState.tiles.addEventListener(
      "update-after",
      dependencies.handleUpdateAfter
    );
    runtimeState.tiles.addEventListener(
      "load-model",
      dependencies.handleModelLoad
    );
    runtimeState.tiles.addEventListener(
      "tile-download-start",
      dependencies.handleDownloadStart
    );
    runtimeState.tiles.addEventListener(
      "dispose-model",
      dependencies.handleModelDispose
    );
    runtimeState.tiles.addEventListener(
      "load-error",
      dependencies.handleLoadError
    );
    runtimeState.tiles.addEventListener(
      "tiles-load-end",
      dependencies.handleTilesLoadEnd
    );
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
    runtimeState.map.on(
      MAPLIBRE_EVENT.MOVE_START,
      dependencies.handleViewStart
    );
    runtimeState.map.on(
      MAPLIBRE_EVENT.MOVE,
      dependencies.scheduleMotionCoverage
    );
    runtimeState.map.on(MAPLIBRE_EVENT.MOVE_END, dependencies.handleViewEnd);
    runtimeState.map.on(MAPLIBRE_EVENT.RESIZE, dependencies.handleViewEnd);
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

  const dispose = () => {
    runtimeState.disposed = true;
    deferredMaterials.dispose();
    if (parseWakeTimer !== null) clearTimeout(parseWakeTimer);
    parseWakeTimer = null;
    if (metadataWakeTimer !== null) clearTimeout(metadataWakeTimer);
    metadataWakeTimer = null;
    dependencies.clearTelemetry();
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
    runtimeState.map?.off(
      MAPLIBRE_EVENT.MOVE_START,
      dependencies.handleViewStart
    );
    runtimeState.map?.off(
      MAPLIBRE_EVENT.MOVE,
      dependencies.scheduleMotionCoverage
    );
    runtimeState.map?.off(MAPLIBRE_EVENT.MOVE_END, dependencies.handleViewEnd);
    runtimeState.map?.off(MAPLIBRE_EVENT.RESIZE, dependencies.handleViewEnd);
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
    runtimeState.tiles?.removeEventListener(
      "load-tileset",
      dependencies.handleTilesetLoad
    );
    runtimeState.tiles?.removeEventListener(
      "update-after",
      dependencies.handleUpdateAfter
    );
    runtimeState.tiles?.removeEventListener(
      "load-model",
      dependencies.handleModelLoad
    );
    runtimeState.tiles?.removeEventListener(
      "tile-download-start",
      dependencies.handleDownloadStart
    );
    runtimeState.tiles?.removeEventListener(
      "dispose-model",
      dependencies.handleModelDispose
    );
    runtimeState.tiles?.removeEventListener(
      "load-error",
      dependencies.handleLoadError
    );
    runtimeState.tiles?.removeEventListener(
      "tiles-load-end",
      dependencies.handleTilesLoadEnd
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
    dispose,
    getQueueTelemetry: () => ({
      metadataDownloadsRunning: metadataDownloads.running,
      metadataParsingRunning: metadataParsing.running,
    }),
    isDeferredMaterialReady: (tile: Tile) => deferredMaterials.isReady(tile),
    onAdd,
    updateDeferredMaterials: () => deferredMaterials.update(),
  };
}
