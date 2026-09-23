import type { Tile } from "3d-tiles-renderer/core";
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
  isMeshTileUnconditionallyRefined,
} from "../../core/mesh-tile-coverage";
import { isPublishedMeshRefinementLevel } from "../../core/mesh-tile-refinement";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import { createCasterVolumeDemand } from "./three-tiles-runtime-caster-demand";
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
    | "shadowSelectionEnabled"
    | "shadowView"
    | "tileCameraDemand"
    | "tileViewFrustum"
    | "tiles"
    | "viewFrustumsReady"
  >,
  cameraErrors: { values: WeakMap<RuntimeTile, number> },
  getTileScreenError: ThreeTilesRuntimeServices["getTileScreenError"]
) {
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
  let coverageQuery: ReturnType<typeof createMeshRegionCutQuery> | undefined;
  let casterCoverageMask: unknown;
  let casterCoverageFrontier: unknown;
  let casterCoverageQuery:
    | ReturnType<typeof createMeshRegionCutQuery>
    | undefined;
  const isTileNeededForMeshCoverage: ThreeTilesRuntimeServices["isTileNeededForMeshCoverage"] =
    (tile) => {
      if (!runtimeState.options.providesTerrain) return false;
      // A pending receiver cannot fill the viewport until this caster coverage
      // exists. Admit those prerequisites in the same lane, avoiding a cycle.
      if (
        runtimeState.pendingMeshReceiverFrontier?.size &&
        runtimeState.shadowReceiverMask
      ) {
        if (
          casterCoverageMask !== runtimeState.shadowReceiverMask ||
          casterCoverageFrontier !== runtimeState.committedMeshCasterFrontier
        ) {
          casterCoverageMask = runtimeState.shadowReceiverMask;
          casterCoverageFrontier = runtimeState.committedMeshCasterFrontier;
          casterCoverageQuery = createMeshRegionCutQuery(
            runtimeState.committedMeshCasterFrontier,
            Number.MAX_VALUE,
            createCasterVolumeDemand(
              runtimeState.shadowReceiverMask,
              runtimeState.requestedErrorTarget
            )
          );
        }
        if (
          !hasDisplayedAncestor(
            tile,
            runtimeState.committedMeshCasterFrontier
          ) &&
          casterCoverageQuery?.(tile) === null
        )
          return true;
      }
      if (coverageFrontier !== runtimeState.displayedMeshFrontier) {
        coverageFrontier = runtimeState.displayedMeshFrontier;
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
  // Rank each independently publishable improvement by its own visible area
  // and the reduction from the currently displayed ancestor's error.
  let refinementView: unknown;
  let refinementFrontier: unknown;
  let refinementRevision = -1;
  let refinementFrame = -1;
  const refinementBenefits = new Map<Tile, RuntimeTile["meshRefinement"]>();
  const getMeshRefinement = (
    tile: RuntimeTile
  ): RuntimeTile["meshRefinement"] => {
    if (!runtimeState.options.providesTerrain) return undefined;
    const published = runtimeState.displayedMeshFrontier;
    // Native preprocessing queues the owner of still-raw children itself.
    const ownsChildren = published.has(tile) && tile.children?.length > 0;
    if (
      !ownsChildren &&
      tile.internal?.hasRenderableContent &&
      !isPublishedMeshRefinementLevel(tile, published)
    )
      return undefined;
    // Routing JSON does not count as a drawable level. A deeper speculative
    // descendant must not borrow the value of an unrelated coarse ancestor.
    let group = ownsChildren ? tile : tile.parent;
    while (
      group &&
      (!group.internal?.hasRenderableContent ||
        isMeshTileUnconditionallyRefined(group))
    )
      group = group.parent;
    if (
      !group ||
      group.refine !== "REPLACE" ||
      !published.has(group) ||
      group.internal.loadingState !== 4 ||
      !getTileObserverDemand(tile).intersects
    )
      return undefined;
    if (
      refinementView !== runtimeState.tileCameraDemand ||
      refinementFrontier !== published ||
      refinementRevision !== runtimeState.meshContentRevision ||
      refinementFrame !== (runtimeState.tiles?.frameCount ?? -1)
    ) {
      refinementView = runtimeState.tileCameraDemand;
      refinementFrontier = published;
      refinementRevision = runtimeState.meshContentRevision;
      refinementFrame = runtimeState.tiles?.frameCount ?? -1;
      refinementBenefits.clear();
    }
    if (refinementBenefits.has(tile)) return refinementBenefits.get(tile);
    const current = getTileObserverDemand(group as RuntimeTile, true);
    if (!current.intersects || !Number.isFinite(current.errorPixels)) {
      refinementBenefits.set(tile, undefined);
      return undefined;
    }
    let nextErrorPixels = 0;
    let visibleChildren = 0;
    let provisional = false;
    const pending = ownsChildren ? [...(group.children ?? [])] : [tile];
    while (pending.length) {
      const child = pending.pop()!;
      if (
        child.internal?.hasRenderableContent &&
        !isMeshTileUnconditionallyRefined(child)
      ) {
        const demand = getTileObserverDemand(child as RuntimeTile);
        if (demand.intersects) {
          visibleChildren++;
          if (Number.isFinite(demand.errorPixels))
            nextErrorPixels = Math.max(nextErrorPixels, demand.errorPixels);
          else provisional = true;
        }
      } else if (child.children?.length) pending.push(...child.children);
      else if (child.internal?.hasContent !== false) provisional = true;
    }
    if (provisional)
      nextErrorPixels = Math.max(
        nextErrorPixels,
        runtimeState.requestedErrorTarget,
        runtimeState.memoryErrorTarget
      );
    else if (visibleChildren === 0) nextErrorPixels = current.errorPixels;
    const visibleAreaPixels =
      getTileObserverDemand(tile, true).visibleAreaPixels ?? 0;
    const benefit =
      visibleAreaPixels * Math.max(0, current.errorPixels - nextErrorPixels);
    const result = {
      group,
      currentErrorPixels: current.errorPixels,
      nextErrorPixels,
      visibleAreaPixels,
      benefit: Number.isFinite(benefit) ? benefit : 0,
      provisional: provisional || visibleAreaPixels === 0,
    };
    refinementBenefits.set(tile, result);
    return result;
  };
  const getTileRequestPriority: ThreeTilesRuntimeServices["getTileRequestPriority"] =
    (tile) => {
      tile.meshRefinement = undefined;
      if (
        runtimeState.meshCoverageRecovery &&
        isTileNeededForMeshCoverage(tile)
      )
        return TILE_CAMERA_PRIORITY.VIEWPORT_FILL;
      const inObserver = getTileObserverDemand(tile).intersects;
      tile.meshRefinement = getMeshRefinement(tile);
      return resolveTileRequestPriority({
        replacementSupport:
          inObserver && runtimeState.meshRefinementSupport.has(tile),
        cameraPriority: Math.max(
          getTileCameraDemand(tile).priority,
          tile.meshRefinement
            ? TILE_CAMERA_PRIORITY.PRIMARY
            : Number.NEGATIVE_INFINITY
        ),
        motionPrefetch: !!tile.motionPrefetch,
        observerVisible: inObserver,
        selectedShadowReceiver:
          runtimeState.shadowSelectionEnabled &&
          tile.shadowReceiverCurrent === true,
        shadowWithoutSelection:
          !!runtimeState.shadowView && !runtimeState.shadowSelectionEnabled,
      });
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
  };
}
