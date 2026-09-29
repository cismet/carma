import * as THREE from "three";

import {
  createTileCameraDemand,
  TILE_CAMERA_PRIORITY,
  TILE_MAIN_OBSERVER_ID,
} from "../../core/tile-camera-demand";
import { resolveTileRequestPriority } from "../../core/tile-scheduling-policy";
import { readOrientedTileBounds } from "./three-tiles-bounds";
import {
  createMeshRegionCutQuery,
  hasDisplayedAncestor,
} from "../../core/mesh-tile-coverage";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import { createMeshCameraObjectives } from "./three-tiles-runtime-camera-objective";
import type { RuntimeTile } from "./three-tiles-runtime-types";

/** Evaluates camera and observer demand and ranks native tile requests. */
export function createThreeTilesSpatialDemand(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    | "committedMeshCasterFrontier"
    | "pendingMeshReceiverFrontier"
    | "displayedMeshFrontier"
    | "effectiveErrorTarget"
    | "memoryErrorTarget"
    | "meshContentRevision"
    | "meshCoverageRecovery"
    | "meshRefinementSupport"
    | "options"
    | "requestedErrorTarget"
    | "shadowReceiverMask"
    | "pendingMeshReceiverMask"
    | "shadowCasterRequests"
    | "shadowSelectionEnabled"
    | "shadowView"
    | "tileCameraDemand"
    | "tileRetries"
    | "tileViewFrustum"
    | "tiles"
    | "viewFrustumsReady"
  >,
  cameraErrors: { values: WeakMap<RuntimeTile, number> },
  getTileScreenError: ThreeTilesRuntimeServices["getTileScreenError"]
) {
  const meshCameras = createMeshCameraObjectives(runtimeState);
  const cameraBounds = new THREE.Box3();
  const cameraBoundsTransform = new THREE.Matrix4();
  const noCameraDemand = {
    required: false,
    receiver: false,
    errorRatio: 0,
    priority: Number.NEGATIVE_INFINITY,
  };
  type CachedCameraDemand = Readonly<{
    required: boolean;
    receiver: boolean;
    errorRatio: number;
    priority: number;
  }>;
  // A tile's demand only changes with the compiled tile cameras (a new
  // object per camera signature), yet priority, attachment and shadow
  // selection ask for the same tile several times per frame. Decision: memo
  // per tile for the lifetime of the compiled demand object; the 2026-09-18
  // cold-start profile put the evaluation family at 1.5-2 s of a 15 s shadow
  // load, see TILES_COVERAGE.md#main-thread-gltf-parse-share-2026-09-18.
  let cameraDemandCache = new WeakMap<
    RuntimeTile,
    [CachedCameraDemand | null, CachedCameraDemand | null]
  >();
  let cameraDemandCacheOwner: unknown = null;
  const getTileCameraDemand: ThreeTilesRuntimeServices["getTileCameraDemand"] =
    (tile, includeObserver = false) => {
      if (
        !includeObserver &&
        !runtimeState.tileCameraDemand.views.some(
          (view) => view.id !== TILE_MAIN_OBSERVER_ID
        )
      )
        return noCameraDemand;
      if (runtimeState.options.providesTerrain) {
        const demand = meshCameras.demand(tile, includeObserver);
        if (includeObserver && demand.required)
          cameraErrors.values.set(
            tile,
            demand.errorRatio * runtimeState.effectiveErrorTarget
          );
        return demand;
      }
      const bounds = tile.engineData?.boundingVolume;
      if (
        !runtimeState.tiles ||
        !bounds?.getAABB ||
        (!includeObserver &&
          !runtimeState.tileCameraDemand.views.some(
            (view) => view.id !== TILE_MAIN_OBSERVER_ID
          ))
      )
        return noCameraDemand;
      if (cameraDemandCacheOwner !== runtimeState.tileCameraDemand) {
        cameraDemandCacheOwner = runtimeState.tileCameraDemand;
        cameraDemandCache = new WeakMap();
      }
      const slot = includeObserver ? 1 : 0;
      const cached = cameraDemandCache.get(tile);
      const hit = cached?.[slot];
      if (hit) {
        if (includeObserver && hit.required)
          cameraErrors.values.set(
            tile,
            hit.errorRatio * runtimeState.effectiveErrorTarget
          );
        return hit;
      }
      readOrientedTileBounds(bounds, cameraBounds, cameraBoundsTransform);
      cameraBoundsTransform.premultiply(runtimeState.tiles.group.matrixWorld);
      const demand = runtimeState.tileCameraDemand.evaluate(
        cameraBounds,
        tile.geometricError *
          runtimeState.tiles.group.matrixWorld.getMaxScaleOnAxis(),
        // This API describes additional camera roles. The primary observer
        // must not bypass the independent shadow publication gate.
        includeObserver ? undefined : TILE_MAIN_OBSERVER_ID,
        false,
        cameraBoundsTransform
      );
      // The evaluation result is scratch storage; keep a copy.
      const result: CachedCameraDemand = {
        required: demand.required,
        receiver: demand.receiver,
        errorRatio: demand.errorRatio,
        priority: demand.priority,
      };
      const entry = cached ?? [null, null];
      entry[slot] = result;
      if (!cached) cameraDemandCache.set(tile, entry);
      if (includeObserver && demand.required)
        cameraErrors.values.set(
          tile,
          demand.errorRatio * runtimeState.effectiveErrorTarget
        );
      return result;
    };
  let observerOwner: unknown;
  let observer: ReturnType<typeof createTileCameraDemand> | null = null;
  let observerErrorTarget = 1;
  let observerDemands = new WeakMap<
    RuntimeTile,
    { intersects: boolean; errorPixels: number; visibleAreaPixels?: number }
  >();
  const getTileObserverDemand: ThreeTilesRuntimeServices["getTileObserverDemand"] =
    (tile, includeVisibleArea = false) => {
      const volume = tile.engineData?.boundingVolume;
      if (observerOwner !== runtimeState.tileCameraDemand) {
        observerOwner = runtimeState.tileCameraDemand;
        const views = runtimeState.tileCameraDemand.views.filter(
          (view) => view.id === TILE_MAIN_OBSERVER_ID
        );
        observer = views.length ? createTileCameraDemand(views) : null;
        observerErrorTarget = views[0]?.errorTargetPixels ?? 1;
        observerDemands = new WeakMap();
      }
      const cached = observerDemands.get(tile);
      if (
        cached &&
        (!includeVisibleArea || cached.visibleAreaPixels !== undefined)
      )
        return cached;
      const inFrustum =
        !volume ||
        !runtimeState.viewFrustumsReady ||
        !volume.intersectsFrustum ||
        volume.intersectsFrustum(runtimeState.tileViewFrustum);
      if (!observer || !volume?.getAABB || !runtimeState.tiles)
        return {
          intersects: inFrustum,
          ...(includeVisibleArea ? { visibleAreaPixels: 0 } : {}),
          errorPixels: volume?.distanceToPoint
            ? getTileScreenError(tile, false)
            : tile.traversal?.error ?? Number.POSITIVE_INFINITY,
        };
      readOrientedTileBounds(volume, cameraBounds, cameraBoundsTransform);
      cameraBoundsTransform.premultiply(runtimeState.tiles.group.matrixWorld);
      const demand = observer.evaluate(
        cameraBounds,
        tile.geometricError *
          runtimeState.tiles.group.matrixWorld.getMaxScaleOnAxis(),
        undefined,
        includeVisibleArea,
        cameraBoundsTransform
      );
      const result = {
        ...(includeVisibleArea
          ? { visibleAreaPixels: inFrustum ? demand.visibleAreaPixels ?? 0 : 0 }
          : {}),
        intersects: inFrustum && demand.required,
        errorPixels: demand.required
          ? demand.errorRatio * observerErrorTarget
          : Number.POSITIVE_INFINITY,
      };
      observerDemands.set(tile, result);
      return result;
    };
  let coverageFrontier = runtimeState.displayedMeshFrontier;
  let coverageView: unknown;
  let coverageRevision = -1;
  let coverageFrame = -1;
  let coverageQuery: ReturnType<typeof createMeshRegionCutQuery> | undefined;
  const isTileNeededForMeshCoverage: ThreeTilesRuntimeServices["isTileNeededForMeshCoverage"] =
    (tile) => {
      if (!runtimeState.options.providesTerrain) return false;
      if (
        coverageFrontier !== runtimeState.displayedMeshFrontier ||
        coverageView !== runtimeState.tileCameraDemand ||
        coverageRevision !== runtimeState.meshContentRevision ||
        coverageFrame !== (runtimeState.tiles?.frameCount ?? -1)
      ) {
        // A retained cut can expose different holes after a pan or a load.
        // Subtree proofs belong to this prepared demand/content snapshot.
        coverageFrontier = runtimeState.displayedMeshFrontier;
        coverageView = runtimeState.tileCameraDemand;
        coverageRevision = runtimeState.meshContentRevision;
        coverageFrame = runtimeState.tiles?.frameCount ?? -1;
        coverageQuery = undefined;
      }
      if (hasDisplayedAncestor(tile, coverageFrontier)) return false;
      coverageQuery ??= createMeshRegionCutQuery(
        coverageFrontier,
        Number.MAX_VALUE,
        (candidate) => getTileObserverDemand(candidate as RuntimeTile)
      );
      return coverageQuery(tile) === null;
    };
  const getTileRequestPriority: ThreeTilesRuntimeServices["getTileRequestPriority"] =
    (tile) => {
      const objective = runtimeState.options.providesTerrain
        ? meshCameras.objective(tile)
        : undefined;
      tile.meshRefinement =
        objective && objective.priority > Number.NEGATIVE_INFINITY
          ? objective
          : undefined;
      if (isTileNeededForMeshCoverage(tile))
        return TILE_CAMERA_PRIORITY.VIEWPORT_FILL;
      const inObserver = getTileObserverDemand(tile).intersects;
      return Math.max(
        objective?.priority ?? Number.NEGATIVE_INFINITY,
        resolveTileRequestPriority({
          replacementSupport: runtimeState.meshRefinementSupport.has(tile),
          cameraPriority: getTileCameraDemand(tile).priority,
          motionPrefetch: !!tile.motionPrefetch,
          observerVisible: inObserver,
          selectedShadowReceiver:
            runtimeState.shadowSelectionEnabled &&
            (runtimeState.options.providesTerrain
              ? runtimeState.shadowCasterRequests.has(tile)
              : tile.shadowReceiverCurrent === true),
          shadowWithoutSelection:
            !!runtimeState.shadowView && !runtimeState.shadowSelectionEnabled,
        })
      );
    };
  const resetDemandCaches = () => {
    coverageQuery = undefined;
    observerDemands = new WeakMap();
  };
  return {
    getTileCameraDemand,
    getTileObserverDemand,
    getTileRequestPriority,
    isTileNeededForMeshCoverage,
    resetDemandCaches,
    resetMeshCameraObjectives: () => {
      resetDemandCaches();
      meshCameras.reset();
    },
  };
}
