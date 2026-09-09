import { type Tile } from "3d-tiles-renderer/core";
import * as THREE from "three";

import { receiverMatchedTileError } from "../../core/shadow-receiver-mask";
import type { SharedThreeSceneTileVolume } from "./shared-three-scene-layer";
import { readOrientedTileBounds } from "./three-tiles-bounds";
import { TILES_LOAD_POLICY } from "./three-tiles-load-policy";
import {
  getReadyMeshRegionCut,
  hasMeshRefinementContentInView,
} from "./three-tiles-mesh-frontier";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import type { RuntimeTile } from "./three-tiles-runtime-types";

/** spatial responsibility of the shared 3D Tiles runtime. */
export function createThreeTilesSpatial(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    | "modelWorldBounds"
    | "tiles"
    | "runtimeVisible"
    | "tileViewElevationProjection"
    | "tileViewElevationFrustum"
    | "options"
    | "tileBoundingBox"
    | "committedMeshCasterFrontier"
    | "displayedMeshFrontier"
    | "activeTileBoundingBox"
    | "tileBoundsTransform"
    | "tilesetUrl"
    | "mainViewIntersectionCache"
    | "viewFrustumsReady"
    | "tileViewFrustum"
    | "deferred"
    | "tileRetries"
    | "effectiveErrorTarget"
    | "tileBoundingSphere"
    | "tileProjectedCenter"
    | "tileViewProjection"
    | "shadowReceiverMask"
    | "shadowReceiverMatch"
    | "rootBoundsTransform"
    | "rootTileBoundingBox"
    | "rootWorldBoundingBox"
    | "offsetGroup"
    | "mainViewProjectionChanged"
    | "lastMainViewProjection"
    | "marginCamera"
    | "marginProjection"
    | "marginFrustum"
    | "requestedErrorTarget"
  >,
  dependencies: Pick<
    ThreeTilesRuntimeServices,
    "getStableTileId" | "getTileLoadReason"
  >
) {
  let cameraErrors = new WeakMap<RuntimeTile, number>();
  const readModelWorldBounds: ThreeTilesRuntimeServices["readModelWorldBounds"] =
    (model: THREE.Object3D, target: THREE.Box3): THREE.Box3 => {
      // Tile payloads are immutable after GLTF publication. Updating the root's
      // parent chain is cheap; walking every vertex-bearing descendant on every
      // corridor query was not (15.6 s in one startup trace). Rebuild only if
      // the runtime placement itself changed.
      model.updateWorldMatrix(true, false);
      const cached = runtimeState.modelWorldBounds.get(model);
      if (cached?.rootMatrixWorld.equals(model.matrixWorld)) {
        return target.copy(cached.bounds);
      }
      model.updateWorldMatrix(true, true);
      target.setFromObject(model);
      runtimeState.modelWorldBounds.set(model, {
        rootMatrixWorld: model.matrixWorld.clone(),
        bounds: target.clone(),
      });
      return target;
    };

  const getViewElevationRange: ThreeTilesRuntimeServices["getViewElevationRange"] =
    (camera: THREE.Camera): readonly [number, number] | null => {
      if (!runtimeState.tiles || !runtimeState.runtimeVisible) return null;
      const currentTiles = runtimeState.tiles;
      camera.updateMatrixWorld(true);
      currentTiles.group.updateWorldMatrix(true, false);
      runtimeState.tileViewElevationProjection.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse
      );
      runtimeState.tileViewElevationFrustum.setFromProjectionMatrix(
        runtimeState.tileViewElevationProjection,
        camera.coordinateSystem,
        camera.reversedDepth
      );
      let minimum = Number.POSITIVE_INFINITY;
      let maximum = Number.NEGATIVE_INFINITY;
      for (const tile of currentTiles.visibleTiles) {
        if (
          runtimeState.options.providesTerrain &&
          !isTileInMainView(tile as RuntimeTile)
        )
          continue;
        const model = (tile as RuntimeTile).engineData?.scene;
        if (!model) continue;
        readModelWorldBounds(model, runtimeState.tileBoundingBox);
        if (runtimeState.tileBoundingBox.isEmpty()) continue;
        if (
          !runtimeState.tileViewElevationFrustum.intersectsBox(
            runtimeState.tileBoundingBox
          )
        )
          continue;
        minimum = Math.min(minimum, runtimeState.tileBoundingBox.min.y);
        maximum = Math.max(maximum, runtimeState.tileBoundingBox.max.y);
      }
      return Number.isFinite(minimum) && Number.isFinite(maximum)
        ? [minimum, maximum]
        : null;
    };

  const getActiveTileVolumes: ThreeTilesRuntimeServices["getActiveTileVolumes"] =
    (): readonly SharedThreeSceneTileVolume[] => {
      if (!runtimeState.tiles || !runtimeState.runtimeVisible) return [];
      runtimeState.tiles.group.updateWorldMatrix(true, false);
      const volumes: SharedThreeSceneTileVolume[] = [];
      for (const tile of runtimeState.tiles.activeTiles) {
        // Native traversal may keep active metadata/ancestors while the atomic
        // corridor cut is staged. Only the published surface supplies receivers.
        if (
          runtimeState.options.providesTerrain &&
          !runtimeState.tiles.visibleTiles.has(tile)
        )
          continue;
        if (
          runtimeState.options.providesTerrain &&
          !isTileInMainView(tile as RuntimeTile) &&
          (tile as RuntimeTile).shadowReceiverCenterness === undefined &&
          !runtimeState.committedMeshCasterFrontier.has(tile)
        )
          continue;
        const activeTile = tile as RuntimeTile;
        // Use the loaded surface, not an ECEF-axis-aligned metadata box rotated
        // into the local frame. That conservative double AABB can inflate a city
        // tile's vertical span by kilometres and destroy shadow contact resolution.
        runtimeState.activeTileBoundingBox.makeEmpty();
        const model = activeTile.engineData?.scene;
        if (model) {
          readModelWorldBounds(model, runtimeState.activeTileBoundingBox);
        }
        const boundingVolume = activeTile.engineData?.boundingVolume;
        if (
          runtimeState.activeTileBoundingBox.isEmpty() &&
          boundingVolume?.getAABB
        ) {
          readOrientedTileBounds(
            boundingVolume,
            runtimeState.activeTileBoundingBox,
            runtimeState.tileBoundsTransform
          );
          runtimeState.tileBoundsTransform.premultiply(
            runtimeState.tiles.group.matrixWorld
          );
          runtimeState.activeTileBoundingBox.applyMatrix4(
            runtimeState.tileBoundsTransform
          );
        }
        if (runtimeState.activeTileBoundingBox.isEmpty()) continue;
        volumes.push({
          id: dependencies.getStableTileId(tile),
          kind: runtimeState.options.providesTerrain
            ? "terrain-tile"
            : "3d-tile",
          sourceId: runtimeState.tilesetUrl,
          geometricError: tile.geometricError,
          errorPixels: getTileScreenError(tile as RuntimeTile),
          loadReason: dependencies.getTileLoadReason(activeTile as RuntimeTile),
          minimum: runtimeState.activeTileBoundingBox.min.toArray(),
          maximum: runtimeState.activeTileBoundingBox.max.toArray(),
        });
      }
      return volumes;
    };

  const isTileInMainView: ThreeTilesRuntimeServices["isTileInMainView"] = (
    tile: RuntimeTile
  ): boolean => {
    const cached = runtimeState.mainViewIntersectionCache.get(tile);
    if (cached !== undefined) return cached;
    const bounds = tile.engineData?.boundingVolume;
    if (
      !bounds ||
      !runtimeState.viewFrustumsReady ||
      typeof bounds.intersectsFrustum !== "function"
    ) {
      return tile.traversal?.inFrustum ?? false;
    }
    const inView = bounds.intersectsFrustum(runtimeState.tileViewFrustum);
    runtimeState.mainViewIntersectionCache.set(tile, inView);
    return inView;
  };

  const isChildUnloadable: ThreeTilesRuntimeServices["isChildUnloadable"] = (
    child: RuntimeTile
  ): boolean =>
    runtimeState.deferred.has(child) ||
    runtimeState.tileRetries.isBlocked(child) ||
    (!child.internal?.hasContent && (child.children?.length ?? 0) === 0);

  /**
   * The main view converged when every displayed tile inside the main camera
   * frustum either meets the effective target or cannot refine any further
   * because all of its children are deferred, retry-blocked or empty.
   */
  const mainViewWithinErrorFactor: ThreeTilesRuntimeServices["mainViewWithinErrorFactor"] =
    (
      factor: number,
      allowBlocked = true,
      frontier: ReadonlySet<Tile> | undefined = runtimeState.options
        .providesTerrain
        ? runtimeState.displayedMeshFrontier
        : runtimeState.tiles?.visibleTiles
    ) => {
      // Mesh visibleTiles also contains offscreen casters (and their retained
      // parents). Only the loaded receiver cut drives viewport LOD progression;
      // corridor completeness is checked independently before shadow capture.
      // Testing the render union can strand a complete viewport at its coarse
      // startup target while every request queue is already empty.
      if (!runtimeState.tiles || !frontier || frontier.size === 0) return false;
      const acceptedError = runtimeState.effectiveErrorTarget * factor;
      const root = runtimeState.tiles.rootTileset?.root;
      if (runtimeState.options.providesTerrain && root) {
        // A complete-looking loaded subset is not proof of viewport coverage.
        // Missing intersecting branches must keep the settled demand audit alive.
        return (
          getReadyMeshRegionCut(root, frontier, acceptedError, (tile) => ({
            intersects:
              !tile.engineData?.boundingVolume ||
              isTileInMainView(tile as RuntimeTile),
            errorPixels: getTileScreenError(tile as RuntimeTile),
          })) !== null
        );
      }
      for (const visible of frontier) {
        const tile = visible as RuntimeTile;
        const children = (tile.children ?? []) as RuntimeTile[];
        if (children.length === 0 || tile.traversal?.unconditionallyRefine) {
          continue;
        }
        if (!isTileInMainView(tile)) continue;
        if (getTileScreenError(tile) <= acceptedError) continue;
        // A loose parent box can intersect the camera while all processed child
        // volumes miss it. There is no visible refinement to fetch in that branch.
        // Test current bounds, not a previous traversal's inFrustum/failed flag;
        // unknown child bounds still block convergence until they are processed.
        if (
          children.every(
            (child) =>
              !hasMeshRefinementContentInView(
                child,
                (candidate) =>
                  !(candidate as RuntimeTile).engineData?.boundingVolume ||
                  isTileInMainView(candidate as RuntimeTile)
              )
          )
        )
          continue;
        if (!allowBlocked || !children.every(isChildUnloadable)) return false;
      }
      return true;
    };

  const mainViewConverged: ThreeTilesRuntimeServices["mainViewConverged"] =
    () => mainViewWithinErrorFactor(1);

  const getTileCenterness: ThreeTilesRuntimeServices["getTileCenterness"] = (
    bounds: NonNullable<RuntimeTile["engineData"]>["boundingVolume"]
  ) => {
    if (!bounds) return 0;
    bounds.getSphere(runtimeState.tileBoundingSphere);
    runtimeState.tileProjectedCenter
      .copy(runtimeState.tileBoundingSphere.center)
      .applyMatrix4(runtimeState.tileViewProjection);
    const centerDistance = Math.min(
      Math.SQRT2,
      Math.hypot(
        runtimeState.tileProjectedCenter.x,
        runtimeState.tileProjectedCenter.y
      )
    );
    return 1 - centerDistance / Math.SQRT2;
  };

  const getTileScreenError: ThreeTilesRuntimeServices["getTileScreenError"] = (
    tile: RuntimeTile
  ): number => {
    if (!runtimeState.tiles) return Number.POSITIVE_INFINITY;
    const cached = cameraErrors.get(tile);
    if (cached !== undefined) return cached;
    const target = {
      inView: false,
      error: Number.POSITIVE_INFINITY,
      distanceFromCamera: Number.POSITIVE_INFINITY,
    };
    if (tile.engineData?.boundingVolume?.distanceToPoint) {
      runtimeState.tiles.calculateTileViewError(tile, target);
    } else if (isTileInMainView(tile)) {
      target.inView = true;
      target.error = tile.traversal?.error ?? Number.POSITIVE_INFINITY;
    }
    if (target.inView) {
      if (tile.engineData?.boundingVolume?.distanceToPoint)
        cameraErrors.set(tile, target.error);
      return target.error;
    }
    const bounds = tile.engineData?.boundingVolume;
    if (bounds?.getAABB) {
      readOrientedTileBounds(
        bounds,
        runtimeState.tileBoundingBox,
        runtimeState.tileBoundsTransform
      );
      // A staged finer receiver can have a smaller prism. The still-published
      // coarse family retains its fringe casters until their joint replacement;
      // those casters remain measurable against that committed receiver mask.
      if (
        runtimeState.shadowReceiverMask?.match(
          runtimeState.tileBoundingBox,
          runtimeState.shadowReceiverMatch,
          runtimeState.tileBoundsTransform,
          { key: tile, parent: tile.parent ?? undefined }
        )
      ) {
        return receiverMatchedTileError(
          tile.geometricError,
          runtimeState.shadowReceiverMatch.receiverGeometricError,
          runtimeState.effectiveErrorTarget,
          runtimeState.shadowReceiverMatch.receiverPixelsPerMeter
        );
      }
    }
    return Number.POSITIVE_INFINITY;
  };

  const updateRootWorldBounds: ThreeTilesRuntimeServices["updateRootWorldBounds"] =
    (): boolean => {
      if (!runtimeState.tiles) return false;
      const volume = (
        runtimeState.tiles.rootTileset?.root as RuntimeTile | undefined
      )?.engineData?.boundingVolume;
      runtimeState.rootBoundsTransform.identity();
      if (volume?.getOBB) {
        readOrientedTileBounds(
          volume,
          runtimeState.rootTileBoundingBox,
          runtimeState.rootBoundsTransform
        );
      } else if (
        !runtimeState.tiles.getBoundingBox(runtimeState.rootTileBoundingBox)
      ) {
        return false;
      }
      // Expanding in ECEF before returning to the local frame can turn a thin
      // city surface into a kilometres-high box and an equally long caster ray.
      runtimeState.rootBoundsTransform.premultiply(
        runtimeState.tiles.group.matrixWorld
      );
      runtimeState.rootWorldBoundingBox
        .copy(runtimeState.rootTileBoundingBox)
        .applyMatrix4(runtimeState.rootBoundsTransform);
      return !runtimeState.rootWorldBoundingBox.isEmpty();
    };

  /** Main-view and prefetch-margin frustums in the tiles group frame. */
  const prepareViewFrustums: ThreeTilesRuntimeServices["prepareViewFrustums"] =
    (viewCamera: THREE.Camera) => {
      if (!runtimeState.tiles) return;
      // Scope native camera-error memoization to this audit, never a prior drag.
      cameraErrors = new WeakMap();
      // Refresh the parents directly, then let TilesGroup recompute its own
      // world matrix so its cached inverse (used by the traversal) stays in sync.
      runtimeState.offsetGroup.updateWorldMatrix(true, false);
      runtimeState.tiles.group.updateMatrixWorld(true);
      runtimeState.tileViewProjection
        .multiplyMatrices(
          viewCamera.projectionMatrix,
          viewCamera.matrixWorldInverse
        )
        .multiply(runtimeState.tiles.group.matrixWorld);
      runtimeState.mainViewProjectionChanged =
        !runtimeState.lastMainViewProjection.equals(
          runtimeState.tileViewProjection
        );
      if (runtimeState.mainViewProjectionChanged) {
        runtimeState.mainViewIntersectionCache = new WeakMap();
        runtimeState.lastMainViewProjection.copy(
          runtimeState.tileViewProjection
        );
      }
      runtimeState.tileViewFrustum.setFromProjectionMatrix(
        runtimeState.tileViewProjection,
        viewCamera.coordinateSystem,
        viewCamera.reversedDepth
      );
      if (viewCamera instanceof THREE.PerspectiveCamera) {
        runtimeState.marginCamera.fov =
          viewCamera.fov * TILES_LOAD_POLICY.prefetchMarginFovFactor;
        runtimeState.marginCamera.aspect = viewCamera.aspect;
        runtimeState.marginCamera.near = viewCamera.near;
        runtimeState.marginCamera.far = viewCamera.far;
        runtimeState.marginCamera.zoom = viewCamera.zoom;
        runtimeState.marginCamera.updateProjectionMatrix();
        runtimeState.marginProjection
          .multiplyMatrices(
            runtimeState.marginCamera.projectionMatrix,
            viewCamera.matrixWorldInverse
          )
          .multiply(runtimeState.tiles.group.matrixWorld);
        runtimeState.marginFrustum.setFromProjectionMatrix(
          runtimeState.marginProjection,
          viewCamera.coordinateSystem,
          viewCamera.reversedDepth
        );
      } else {
        runtimeState.marginFrustum.copy(runtimeState.tileViewFrustum);
      }
      runtimeState.viewFrustumsReady = true;
    };

  const isTileInPrefetchMargin: ThreeTilesRuntimeServices["isTileInPrefetchMargin"] =
    (tile: RuntimeTile): boolean => {
      const bounds = tile.engineData?.boundingVolume;
      if (!bounds || !runtimeState.viewFrustumsReady) return false;
      return bounds.intersectsFrustum(runtimeState.marginFrustum);
    };

  const isMainViewReady: ThreeTilesRuntimeServices["isMainViewReady"] = () =>
    mainViewWithinErrorFactor(
      runtimeState.requestedErrorTarget / runtimeState.effectiveErrorTarget,
      false
    );
  return {
    readModelWorldBounds,
    getViewElevationRange,
    getActiveTileVolumes,
    isTileInMainView,
    isChildUnloadable,
    mainViewWithinErrorFactor,
    mainViewConverged,
    getTileCenterness,
    getTileScreenError,
    updateRootWorldBounds,
    prepareViewFrustums,
    isTileInPrefetchMargin,
    isMainViewReady,
  };
}
