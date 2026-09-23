import { notifyTileResponse } from "./tile-response-observers";
import type { resolveTileRequestNeed } from "../../core/tile-request-need";
import { TilesRenderer } from "3d-tiles-renderer";
import { LRUCache, type Tile } from "3d-tiles-renderer/core";
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
import { Gltf1UpgradePlugin } from "./gltf1-upgrade-plugin";
import { subscribeSharedThreeTerrainLoading } from "./shared-three-terrain-registry";
import { isExtentFloorTile } from "../../core/mesh-error-policy";
import {
  KICKSTART_INTERVAL_MS,
  MESH_PARSE_CONCURRENCY,
} from "./three-tiles-runtime-config";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import { debugTilesRuntimes } from "./three-tiles-runtime-debug";
import { createThreeTilesPayloadQueues } from "./three-tiles-runtime-payload-queues";
import { disposeThreeTilesAttachment } from "./three-tiles-runtime-attachment-disposal";
import { installThreeTilesTraversalHooks } from "./three-tiles-runtime-traversal-hooks";
import type {
  RuntimeTile,
  RuntimeTilesRenderer,
} from "./three-tiles-runtime-types";
import {
  buildPrimitiveOutlinePlugin,
  tilesCacheUnloadPriorityCallback,
  tilesQueuePriorityCallback,
} from "./three-tiles-runtime-vendor";
import { TilesetDeferredMaterialsPlugin } from "./tileset-deferred-materials-plugin";
import { TilesetHierarchyPlugin } from "./tileset-hierarchy-plugin";
import { TilesetMercatorProjectionPlugin } from "./tileset-mercator-projection-plugin";

export type ThreeTilesRuntimeAttachmentState = Pick<
  ThreeTilesRuntimeState,
  | "bytesPredictor"
  | "cameraSet"
  | "clayMaterialStates"
  | "committedMeshCasterFrontier"
  | "committedMeshReceiverFrontier"
  | "disposed"
  | "dracoLoader"
  | "effectiveErrorTarget"
  | "kickstartTimer"
  | "litTextureMaterialStates"
  | "mainViewProjectionChanged"
  | "mainViewSourceTiles"
  | "map"
  | "memoryAdmissionPaused"
  | "memoryErrorTarget"
  | "loadingPaused"
  | "meshAuditTimer"
  | "meshBaseCoverageReady"
  | "meshInitialHandoverDone"
  | "meshCoverageRecovery"
  | "displayedMeshFrontier"
  | "lastMainViewConverged"
  | "meshRefinementSupport"
  | "extentGeometricError"
  | "extentFloorArmed"
  | "extentFloorAuditPending"
  | "extentFloorPending"
  | "extentFloorInView"
  | "residentAncestors"
  | "ringRefinePasses"
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
  | "shadowView"
  | "tileCameraDemand"
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

export type ThreeTilesRuntimeAttachmentDependencies = Pick<
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
  | "recordTileRequestDecision"
  | "getTileScreenError"
  | "getTileCameraDemand"
  | "getTileRequestPriority"
  | "isTileNeededForMeshCoverage"
  | "handleContextLost"
  | "handleContextRestored"
  | "handleLoadError"
  | "handleModelDispose"
  | "handleModelLoad"
  | "handleTileVisibilityChange"
  | "handleTilesetLoad"
  | "handleTilesLoadEnd"
  | "handleUpdateAfter"
  | "handleViewEnd"
  | "handleViewStart"
  | "handleVisibilityChange"
  | "endCacheCeilingSession"
  | "handleWireBytes"
  | "initialEffectiveErrorTarget"
  | "isTileInMainView"
  | "getTileObserverDemand"
  | "getTileRingIndex"
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
  isTileRequestNeeded: (tile: Tile) => boolean;
  getTileRequestNeed: (tile: Tile) => ReturnType<typeof resolveTileRequestNeed>;
};

export function createThreeTilesRuntimeAttachment(
  runtimeState: ThreeTilesRuntimeAttachmentState,
  dependencies: ThreeTilesRuntimeAttachmentDependencies
) {
  const deferredMaterials = new TilesetDeferredMaterialsPlugin({
    // The idle ring is prefetched to be drawable the moment it scrolls in,
    // so its materials are promoted like the main view's.
    inView: (tile) =>
      dependencies.isTileInMainView(tile as RuntimeTile) ||
      dependencies.getTileCameraDemand(tile as RuntimeTile).receiver ||
      runtimeState.meshRefinementSupport.has(tile) ||
      (runtimeState.extentFloorArmed &&
        runtimeState.extentGeometricError > 0 &&
        isExtentFloorTile(tile, runtimeState.extentGeometricError)) ||
      (tile as RuntimeTile).motionPrefetch === true ||
      (tile as RuntimeTile).idleRing === true,
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
  const payloadQueues = createThreeTilesPayloadQueues(
    runtimeState,
    dependencies
  );
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
    if (runtimeState.options.diagnostics)
      debugTilesRuntimes()?.add(runtimeState);
    const tileCache = new LRUCache();
    tileCache.unloadPriorityCallback = (
      runtimeState.options.providesTerrain
        ? // Upstream uses this comparator for admission too (ascending), then
          // negates it for eviction. Download/parse queues pop from the end.
          (first: Tile, second: Tile) =>
            -tilesQueuePriorityCallback(first, second, false)
        : tilesCacheUnloadPriorityCallback
    ) as typeof tileCache.unloadPriorityCallback;
    runtimeState.tiles.lruCache = tileCache;
    payloadQueues.install();
    // D2: admission registers a predicted size so the cache fills before
    // downloads finish; measured content carries the resident overhead.
    installThreeTilesTraversalHooks(runtimeState, dependencies, payloadQueues);
    runtimeState.tiles.registerPlugin(new ImplicitTilingPlugin());
    runtimeState.tiles.registerPlugin(new UpdateOnChangePlugin());
    if (runtimeState.options.mercatorProjection) {
      runtimeState.tiles.registerPlugin(
        new TilesetMercatorProjectionPlugin(
          runtimeState.options.mercatorProjection
        )
      );
    }
    if (runtimeState.options.providesTerrain)
      runtimeState.tiles.registerPlugin(deferredMaterials);
    if (
      runtimeState.options.hierarchyCache !== false &&
      typeof Worker !== "undefined"
    ) {
      const hierarchy = new TilesetHierarchyPlugin(runtimeState.tilesetUrl, {
        entry: runtimeState.options.entry,
      });
      runtimeState.tiles.registerPlugin(hierarchy);
      if (runtimeState.options.entry?.prefetch?.length)
        hierarchy.prefetch(runtimeState.options.entry.prefetch);
    }
    // Mesh 2020 ships glTF 1.0 b3dm — upgrade payloads on the fly. The raw
    // response feeds the wire-size sampling of the request concurrency.
    runtimeState.tiles.registerPlugin(
      new Gltf1UpgradePlugin({
        onResponse: dependencies.handleWireBytes,
        onBody: (url, decodedBytes) => {
          if (runtimeState.options.diagnostics && runtimeState.tiles)
            notifyTileResponse(runtimeState.tiles, { url, decodedBytes });
        },
      })
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
    // The mesh first-image pass loads its own fallback without sibling demand.
    runtimeState.tiles.loadAncestors = !runtimeState.options.providesTerrain;
    runtimeState.tiles.displayActiveTiles = true;
    runtimeState.tiles.parseQueue.maxJobs = MESH_PARSE_CONCURRENCY;
    runtimeState.normalParseConcurrency = MESH_PARSE_CONCURRENCY;
    dependencies.applyRequestConcurrency();
    // Bound main-thread metadata expansion independently of network concurrency.
    runtimeState.tiles.processNodeQueue.maxJobs = 4;
    // 1,000 nodes delayed input/publication; 64 advances the cut between frames.
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
      "tile-visibility-change",
      dependencies.handleTileVisibilityChange
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
    // A tab killed for memory never gets here; a clean end does.
    window.addEventListener("pagehide", dependencies.endCacheCeilingSession);
  };

  const dispose = () =>
    disposeThreeTilesAttachment(
      runtimeState,
      dependencies,
      deferredMaterials,
      payloadQueues
    );

  return {
    dispose,
    getQueueTelemetry: payloadQueues.getTelemetry,
    getDownloadPreemptionEligibility:
      payloadQueues.getDownloadPreemptionEligibility,
    isDeferredMaterialReady: (tile: Tile) => deferredMaterials.isReady(tile),
    onAdd,
    updateDeferredMaterials: () => deferredMaterials.update(),
    updateMeshRefinementSupport: (
      support: Set<Tile>,
      unpreparedParents: ReadonlySet<Tile>
    ) => {
      const previous = runtimeState.meshRefinementSupport;
      runtimeState.meshRefinementSupport = support;
      const tiles = runtimeState.tiles;
      if (!tiles) return;
      // Use the bounded native queue; completion requests a fresh traversal.
      for (const parent of unpreparedParents)
        tiles.ensureChildrenArePreprocessed(parent, false);
      // Decision: CURRENT-VIEW-DEMAND-20260913 in TILES_COVERAGE.md.
      // Publication prerequisites use the same queues and material pipeline.
      for (const tile of support) {
        if (!tile.internal && tile.parent)
          tiles.ensureChildrenArePreprocessed(tile.parent);
        // This schedules preprocessing; it does not synchronously initialize
        // every child. Keep the support demand, but do not abort publication
        // by passing raw hierarchy entries to the payload queues.
        if (!tile.internal || !tile.traversal) continue;
        tiles.markTileUsed(tile);
        dependencies.applyTileDeferral(tile, true);
        tiles.queueTileForDownload(tile);
      }
      if ([...support].some((tile) => !previous.has(tile))) {
        deferredMaterials.update();
        tiles.dispatchEvent({ type: "needs-update" });
        dependencies.requestRender();
      }
    },
  };
}
