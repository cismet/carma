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
import { applyShadowReceiverMask } from "../../core/shadow-receiver-mask";
import { Gltf1UpgradePlugin } from "./gltf1-upgrade-plugin";
import { subscribeSharedThreeTerrainLoading } from "./shared-three-terrain-registry";
import { readOrientedTileBounds } from "./three-tiles-bounds";
import {
  idleRingAllowedError,
  initialMeshLoadError,
  isExtentFloorTile,
  TILES_LOAD_POLICY,
} from "./three-tiles-load-policy";
import {
  isMeshCoveredByLoadedChildren,
  isNextPublishedMeshLevel,
  shouldDeferMeshRefinement,
} from "./three-tiles-mesh-frontier";
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
import type {
  RuntimeLruCache,
  RuntimeTile,
  RuntimeTilesRenderer,
} from "./three-tiles-runtime-types";
import {
  buildPrimitiveOutlinePlugin,
  LOADED_LOADING_STATE,
  resolveTileContentUrl,
  tilesCacheUnloadPriorityCallback,
  tilesQueuePriorityCallback,
  UNLOADED_LOADING_STATE,
} from "./three-tiles-runtime-vendor";
import { TilesetDeferredMaterialsPlugin } from "./tileset-deferred-materials-plugin";
import { TilesetHierarchyPlugin } from "./tileset-hierarchy-plugin";
import { TilesetMercatorProjectionPlugin } from "./tileset-mercator-projection-plugin";

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
  | "memoryErrorTarget"
  | "loadingPaused"
  | "meshAuditTimer"
  | "meshBaseCoverageReady"
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
  | "getTileCameraDemand"
  | "getTileRequestPriority"
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
            -tilesQueuePriorityCallback(first, second)
        : tilesCacheUnloadPriorityCallback
    ) as typeof tileCache.unloadPriorityCallback;
    runtimeState.tiles.lruCache = tileCache;
    payloadQueues.install();
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
      if (
        target.inView &&
        (tile as RuntimeTile).engineData?.boundingVolume?.getAABB &&
        runtimeState.tileCameraDemand.views.length > 0
      ) {
        // Decision: UNIFIED-VISIBLE-SSE-20260916 in TILES_COVERAGE.md.
        // Use the same clipped camera-depth error as publication/retention.
        // Taking max(native, clipped) would keep the invisible near-box bias.
        target.error = dependencies.getTileScreenError(tile as RuntimeTile);
      }
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
      if (runtimeState.meshRefinementSupport.has(tile)) {
        runtimeState.tiles?.markTileUsed(tile);
        if (!target.inView) {
          target.inView = true;
          target.error = 0;
        }
      }
      if (runtimeTile.zoomPrefetch) runtimeState.tiles?.markTileUsed(tile);
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
      const cameraDemand = dependencies.getTileCameraDemand(
        tile as RuntimeTile
      );
      if (cameraDemand.required) {
        target.error = Math.max(
          target.inView ? target.error : 0,
          cameraDemand.errorRatio * runtimeState.effectiveErrorTarget
        );
        target.inView = true;
      }
      // Idle rings (skip strategy): with the viewport converged and the map
      // at rest, a tile inside ring k is reported as in view so the renderer
      // requests it, and once its error is within base × 2^(k-1) it is
      // reported as satisfying the target so the renderer stops there. The
      // rings fill from the inside out, coarser with every ring, until the
      // outermost covers the model; publication keeps them hidden until they
      // scroll into the main view. Runs after the corridor mask: a caster the
      // shadow corridor claims keeps its corridor error.
      // Membership is a persistent, memory-bounded model of the extent:
      // refreshed at rest, kept through moves so a loaded ring tile stays
      // used and never becomes the LRU's eviction candidate; new tiles enter
      // only within the ring budget; the cascade refines one level per pass
      // while memory and frame time allow (ringRefinePasses).
      const skipStrategy =
        runtimeState.options.providesTerrain &&
        runtimeState.tiles?.loadAncestors === false;
      // Decision: MESH-COVERAGE-20260912 in engines/maplibre/TILES_COVERAGE.md (R3).
      // The extent floor, in view or not: once the first base coverage
      // exists, ancestors of the floor report an error above any target so
      // the traversal reaches the floor tiles every frame (a visited tile is
      // used, and a used tile is never the LRU's eviction candidate), and a
      // floor tile that is not loaded is the used-set leaf, requested before
      // anything finer below it. The view is a local densification of the
      // resident extent, never a cut above it.
      const extentError = runtimeState.extentGeometricError;
      const floorLevel =
        skipStrategy &&
        runtimeState.extentFloorArmed &&
        isExtentFloorTile(tile, extentError);
      const floorLeaf =
        floorLevel &&
        tile.internal.hasRenderableContent &&
        (tile.children ?? []).every(
          (child) =>
            child.geometricError < extentError ||
            child.internal?.hasRenderableContent === false
        );
      const floorLoaded = tile.internal.loadingState === LOADED_LOADING_STATE;
      // The renderer marks only active leaves used in the LRU; a loaded floor
      // tile the traversal passes through would be an eviction candidate.
      if (floorLevel) runtimeState.tiles!.markTileUsed(tile);
      if (floorLevel && target.inView) {
        runtimeTile.idleRing = false;
        if (floorLeaf && runtimeState.options.diagnostics)
          runtimeState.extentFloorInView.add(tile);
        if (!floorLeaf)
          target.error = Math.max(
            target.error,
            runtimeState.effectiveErrorTarget *
              TILES_LOAD_POLICY.extentFloorAncestorErrorFactor
          );
        else if (!floorLoaded) {
          // Do not spend the cache on children before their replacement
          // coverage arrives. Otherwise an all-used cache cannot admit its
          // missing floor without first punching a hole in the visible cut.
          runtimeState.extentFloorPending += 1;
          dependencies.applyTileDeferral(tile, true);
          runtimeState.tiles!.queueTileForDownload(tile);
          // A reserve parent must not replace already complete finer coverage.
          if (
            tile.internal.hasRenderableContent &&
            !isMeshCoveredByLoadedChildren(
              tile,
              runtimeState.displayedMeshFrontier
            )
          )
            target.error = 0;
        }
      } else if (skipStrategy && !target.inView) {
        const atRest =
          runtimeState.meshBaseCoverageReady &&
          runtimeState.extentFloorArmed &&
          (!runtimeState.shadowView ||
            (runtimeState.lastMainViewConverged &&
              runtimeState.effectiveErrorTarget ===
                runtimeState.requestedErrorTarget)) &&
          runtimeState.map?.isMoving?.() !== true;
        if (atRest) {
          const ring = dependencies.getTileRingIndex(runtimeTile);
          runtimeTile.idleRingIndex = ring > 0 ? ring : undefined;
        }
        const ring = runtimeTile.idleRingIndex ?? 0;
        const cache = runtimeState.tiles!.lruCache as RuntimeLruCache;
        const budgetOpen =
          cache.cachedBytes <
          cache.minBytesSize * TILES_LOAD_POLICY.idleRingBudgetFraction;
        const loaded = floorLoaded;
        // Keep loaded reserve coverage, but admit missing offscreen payloads
        // only after visible demand converges. Ancestors still lead traversal
        // to already resident floor leaves while the view changes.
        const wholeModelRing =
          ring > TILES_LOAD_POLICY.idleRingTanMultipliers.length;
        // The budget bounds how far the reserve refines below its coarse floor.
        const admitted =
          (floorLevel && (!floorLeaf || loaded || atRest)) ||
          (ring > 0 && !wholeModelRing && (loaded || atRest));
        runtimeTile.idleRing = admitted;
        if (floorLeaf && !loaded) runtimeState.extentFloorPending += 1;
        if (admitted) {
          target.inView = true;
          if (floorLevel && !floorLeaf) {
            target.error = Math.max(
              target.error,
              runtimeState.effectiveErrorTarget *
                TILES_LOAD_POLICY.extentFloorAncestorErrorFactor
            );
          } else {
            const inRing = ring > 0 && !wholeModelRing;
            const allowed = inRing
              ? idleRingAllowedError(
                  initialMeshLoadError(
                    runtimeState.requestedErrorTarget,
                    runtimeState.options.baseErrorTargetPixels
                  ),
                  ring,
                  budgetOpen ? runtimeState.ringRefinePasses : 0
                )
              : 0;
            const satisfied = floorLeaf
              ? !inRing || target.error <= allowed || !atRest || !loaded
              : !atRest || target.error <= allowed;
            if (satisfied)
              target.error = Math.min(
                target.error,
                runtimeState.effectiveErrorTarget
              );
          }
        }
      } else {
        runtimeTile.idleRing = false;
        if (target.inView) runtimeTile.idleRingIndex = undefined;
        if (skipStrategy && runtimeState.residentAncestors.has(tile)) {
          // Resident ancestor band: kept used while a descendant is displayed,
          // requested at rest once the base coverage exists, never a leaf.
          runtimeState.tiles!.markTileUsed(tile);
          if (
            tile.internal.loadingState === UNLOADED_LOADING_STATE &&
            runtimeState.meshBaseCoverageReady &&
            runtimeState.lastMainViewConverged &&
            runtimeState.map?.isMoving?.() !== true
          )
            runtimeState.tiles!.queueTileForDownload(tile);
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
      if (
        runtimeState.options.providesTerrain &&
        !runtimeState.shadowView &&
        target.inView &&
        tile.internal.hasRenderableContent &&
        (runtimeState.displayedMeshFrontier.size === 0
          ? target.error <= TILES_LOAD_POLICY.firstImageMaxErrorPixels
          : isNextPublishedMeshLevel(tile, runtimeState.displayedMeshFrontier))
      )
        target.error = Math.min(
          target.error,
          runtimeState.effectiveErrorTarget
        );
      dependencies.applyTileDeferral(tile, target.inView);
    };
    const queueTileForDownload = runtimeState.tiles.queueTileForDownload.bind(
      runtimeState.tiles
    );
    runtimeState.tiles.queueTileForDownload = (tile) => {
      const tiles = runtimeState.tiles;
      if (!tiles) return;
      if (runtimeState.memoryAdmissionPaused || runtimeState.loadingPaused)
        return;
      if (
        tile.internal.loadingState !== UNLOADED_LOADING_STATE ||
        runtimeState.queuedThisTraversal.has(tile)
      )
        return;
      const runtimeTile = tile as RuntimeTile;
      if (!dependencies.isTileRequestNeeded(tile)) return;
      // A payload freed after proven child replacement must not immediately
      // re-enter loadAncestors' queue. Its hierarchy/metadata remains intact.
      const retainedMeshAncestors = dependencies.getRetainedMeshAncestors();
      // A floor tile is the extent's resident coverage: loaded even where
      // its children are drawn, and never held back as a freed parent.
      const floorTile =
        (runtimeState.extentFloorArmed &&
          isExtentFloorTile(tile, runtimeState.extentGeometricError)) ||
        runtimeState.residentAncestors.has(tile);
      const supportTile = runtimeState.meshRefinementSupport.has(tile);
      if (
        runtimeState.options.providesTerrain &&
        !floorTile &&
        !supportTile &&
        (isMeshCoveredByLoadedChildren(tile, tiles.visibleTiles) ||
          (retainedMeshAncestors.has(tile) &&
            tile.internal.hasRenderableContent &&
            !tile.internal.hasUnrenderableContent))
      )
        return;
      if (
        runtimeState.options.providesTerrain &&
        !floorTile &&
        !supportTile &&
        dependencies.isTileInMainView(runtimeTile) &&
        shouldDeferMeshRefinement(
          tile,
          runtimeState.map?.isMoving?.()
            ? initialMeshLoadError(
                runtimeState.requestedErrorTarget,
                runtimeState.options.baseErrorTargetPixels
              )
            : Math.max(
                runtimeState.shadowView
                  ? runtimeState.requestedErrorTarget
                  : runtimeState.effectiveErrorTarget,
                runtimeState.memoryErrorTarget
              ),
          (parent) => dependencies.getTileScreenError(parent as RuntimeTile),
          retainedMeshAncestors,
          runtimeState.options.baseErrorTargetPixels,
          runtimeState.tiles.loadAncestors
        )
      )
        return;
      // D8: a pending retry or an exhausted budget keeps the parent as the
      // fallback instead of re-requesting the tile every frame.
      if (runtimeState.tileRetries.isBlocked(tile)) return;
      // D7: REPLACE content that refines unconditionally is never displayed.
      if (
        tile.refine === "REPLACE" &&
        !floorTile &&
        (tile as RuntimeTile).traversal?.unconditionallyRefine === true &&
        tile.internal.hasRenderableContent
      ) {
        return;
      }
      // A refinement request belongs to its entire immediate REPLACE family.
      // Use the existing queue/material/cancellation path for every sibling;
      // support requests do not fan out recursively into another LOD.
      const family =
        runtimeState.options.providesTerrain &&
        !runtimeState.shadowView &&
        !supportTile &&
        !floorTile &&
        tile.internal.hasRenderableContent &&
        tile.parent?.refine === "REPLACE"
          ? tile.parent.children ?? []
          : [];
      if (family.length) {
        tiles.ensureChildrenArePreprocessed(tile.parent!);
        for (const sibling of family)
          runtimeState.meshRefinementSupport.add(sibling);
      }
      dependencies.assignTilePriority(runtimeTile);
      runtimeState.queuedThisTraversal.add(tile);
      dependencies.getTileDebugProgress(tile).queuedAt ??= performance.now();
      dependencies.noteTileActivity(tile);
      runtimeTile.firstPublicationRequestedAt = performance.now();
      queueTileForDownload(tile);
      for (const sibling of family) {
        if (sibling === tile) continue;
        dependencies.applyTileDeferral(sibling, true);
        dependencies.assignTilePriority(sibling as RuntimeTile);
        tiles.queueTileForDownload(sibling);
      }
    };
    // 3D Tiles 1.1 implicit tiling (template URIs) is plugin-based
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
    // Bootstrap with drawable ancestors. The lifecycle disables this once a
    // complete first cut exists; initial quality must not mean blank startup.
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

  const dispose = () => {
    runtimeState.disposed = true;
    deferredMaterials.dispose();
    payloadQueues.dispose();
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
    window.removeEventListener("pagehide", dependencies.endCacheCeilingSession);
    dependencies.endCacheCeilingSession();
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
      "tile-visibility-change",
      dependencies.handleTileVisibilityChange
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
    debugTilesRuntimes()?.delete(runtimeState);
    runtimeState.tiles?.dispose();
    runtimeState.tiles = null;
    runtimeState.meshRefinementSupport.clear();
    runtimeState.extentFloorArmed = false;
    runtimeState.extentFloorAuditPending = false;
    runtimeState.dracoLoader?.dispose();
    runtimeState.dracoLoader = null;
    runtimeState.orientationGroup.clear();
    runtimeState.map = null;
  };

  return {
    dispose,
    getQueueTelemetry: payloadQueues.getTelemetry,
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
