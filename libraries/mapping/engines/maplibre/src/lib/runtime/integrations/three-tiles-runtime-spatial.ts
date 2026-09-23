import { type Tile } from "3d-tiles-renderer/core";
import * as THREE from "three";

import { receiverMatchedTileError } from "../../core/shadow-receiver-mask";
import { createThreeTilesSpatialDemand } from "./three-tiles-runtime-spatial-demand";
import { createThreeTilesModelFrame } from "./three-tiles-runtime-model-frame";
import { createThreeTilesViewFrustums } from "./three-tiles-runtime-view-frustums";
import type { SharedThreeSceneTileVolume } from "../../core/shared-three-scene-types";
import { readOrientedTileBounds } from "./three-tiles-bounds";
import { getThreeTileDiagnosticSteps } from "./three-tiles-diagnostic-steps";
import { getReadyMeshRegionCut } from "../../core/mesh-tile-coverage";
import { hasMeshRefinementContentInView } from "../../core/mesh-tile-refinement";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import type { RuntimeTile } from "./three-tiles-runtime-types";

/** spatial responsibility of the shared 3D Tiles runtime. */
export function createThreeTilesSpatial(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    | "modelLocalBounds"
    | "frameFromTiles"
    | "referenceToCurrent"
    | "orientationGroup"
    | "tiles"
    | "tileCameraDemand"
    | "runtimeVisible"
    | "tileViewElevationProjection"
    | "tileViewElevationFrustum"
    | "options"
    | "tileBoundingBox"
    | "committedMeshCasterFrontier"
    | "committedMeshCasterFrontier"
    | "pendingMeshReceiverFrontier"
    | "displayedMeshFrontier"
    | "meshRefinementSupport"
    | "meshCoverageRecovery"
    | "meshContentRevision"
    | "memoryErrorTarget"
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
    | "shadowSelectionEnabled"
    | "shadowView"
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
    | "ringFrustums"
    | "tileDebugProgress"
    | "requestedErrorTarget"
  >,
  dependencies: Pick<
    ThreeTilesRuntimeServices,
    "getStableTileId" | "getTileLoadReason"
  >
) {
  const cameraErrors = { values: new WeakMap<RuntimeTile, number>() };
  const { updateFrameFromTiles, readModelFrameBounds } =
    createThreeTilesModelFrame(runtimeState);
  const viewportFocusNdc = new THREE.Vector3();
  const {
    getTileCameraDemand,
    getTileObserverDemand,
    getTileRequestPriority,
    isTileNeededForMeshCoverage,
    resetDemandCaches,
  } = createThreeTilesSpatialDemand(
    runtimeState,
    cameraErrors,
    (tile, includeShadow) => getTileScreenError(tile, includeShadow)
  );

  const getViewElevationRange: ThreeTilesRuntimeServices["getViewElevationRange"] =
    (camera: THREE.Camera): readonly [number, number] | null => {
      if (!runtimeState.tiles || !runtimeState.runtimeVisible) return null;
      const currentTiles = runtimeState.tiles;
      camera.updateMatrixWorld(true);
      runtimeState.tileViewElevationProjection
        .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
        .multiply(runtimeState.referenceToCurrent);
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
        readModelFrameBounds(model, runtimeState.tileBoundingBox);
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
      updateFrameFromTiles();
      const volumes: SharedThreeSceneTileVolume[] = [];
      for (const tile of runtimeState.tiles.activeTiles) {
        // Native traversal may retain active metadata/ancestors. Only the
        // published surface supplies receivers.
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
          readModelFrameBounds(model, runtimeState.activeTileBoundingBox);
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
            runtimeState.frameFromTiles
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
          steps: runtimeState.tileDebugProgress.has(tile)
            ? getThreeTileDiagnosticSteps(
                runtimeState.tileDebugProgress.get(tile)!,
                runtimeState.shadowView !== null,
                performance.now()
              )
            : undefined,
          geometricError: tile.geometricError,
          errorPixels: getTileScreenError(tile as RuntimeTile),
          loadReason: dependencies.getTileLoadReason(activeTile as RuntimeTile),
          receiverObjectId: model?.id,
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
    const inView =
      getTileObserverDemand(tile).intersects ||
      getTileCameraDemand(tile).receiver;
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
              !(tile as RuntimeTile).engineData?.boundingVolume ||
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
        runtimeState.tileProjectedCenter.x - viewportFocusNdc.x,
        runtimeState.tileProjectedCenter.y - viewportFocusNdc.y
      )
    );
    return 1 - centerDistance / Math.SQRT2;
  };

  const getTileScreenError: ThreeTilesRuntimeServices["getTileScreenError"] = (
    tile: RuntimeTile,
    includeShadow = true
  ): number => {
    if (!runtimeState.tiles) return Number.POSITIVE_INFINITY;
    let cameraError = cameraErrors.values.get(tile);
    // The compiled union now includes the main observer. Do not max it with
    // the vendor's uncut-box SSE, which would reintroduce edge overrefinement.
    const volume = tile.engineData?.boundingVolume;
    if (
      cameraError === undefined &&
      volume?.getAABB &&
      runtimeState.tileCameraDemand.views.length > 0
    ) {
      const union = getTileCameraDemand(tile, true);
      if (union.required) {
        cameraError = union.errorRatio * runtimeState.effectiveErrorTarget;
        cameraErrors.values.set(tile, cameraError);
      }
    } else if (cameraError === undefined) {
      // Bootstrap/legacy fallback only when no compiled bound evaluation is
      // available. Never restore uncut-box SSE after a compiled frustum miss.
      const target = {
        inView: false,
        error: Number.POSITIVE_INFINITY,
        distanceFromCamera: Number.POSITIVE_INFINITY,
      };
      if (volume?.distanceToPoint) {
        runtimeState.tiles.calculateTileViewError(tile, target);
      } else if (isTileInMainView(tile)) {
        target.inView = true;
        target.error = tile.traversal?.error ?? Number.POSITIVE_INFINITY;
      }
      if (target.inView) {
        cameraError = target.error;
        if (volume?.distanceToPoint) cameraErrors.values.set(tile, cameraError);
      }
    }
    const bounds = tile.engineData?.boundingVolume;
    if (
      includeShadow &&
      cameraError === undefined &&
      bounds?.getAABB &&
      runtimeState.shadowReceiverMask
    ) {
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
        return Math.max(
          cameraError ?? 0,
          receiverMatchedTileError(
            tile.geometricError,
            runtimeState.shadowReceiverMatch.receiverGeometricError,
            runtimeState.effectiveErrorTarget,
            runtimeState.shadowReceiverMatch.receiverPixelsPerMeter
          )
        );
      }
    }
    return cameraError ?? Number.POSITIVE_INFINITY;
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
      runtimeState.rootBoundsTransform.premultiply(updateFrameFromTiles());
      runtimeState.rootWorldBoundingBox
        .copy(runtimeState.rootTileBoundingBox)
        .applyMatrix4(runtimeState.rootBoundsTransform);
      return !runtimeState.rootWorldBoundingBox.isEmpty();
    };

  const { prepareViewFrustums, isTileInPrefetchMargin, getTileRingIndex } =
    createThreeTilesViewFrustums(runtimeState, viewportFocusNdc, () => {
      cameraErrors.values = new WeakMap();
      resetDemandCaches();
    });

  const isMainViewReady: ThreeTilesRuntimeServices["isMainViewReady"] = () =>
    mainViewWithinErrorFactor(
      runtimeState.requestedErrorTarget / runtimeState.effectiveErrorTarget,
      false
    );
  return {
    readModelFrameBounds,
    updateFrameFromTiles,
    getViewElevationRange,
    getActiveTileVolumes,
    isTileInMainView,
    getTileObserverDemand,
    getTileCameraDemand,
    getTileRequestPriority,
    isTileNeededForMeshCoverage,
    isChildUnloadable,
    mainViewWithinErrorFactor,
    mainViewConverged,
    getTileCenterness,
    getTileScreenError,
    updateRootWorldBounds,
    prepareViewFrustums,
    isTileInPrefetchMargin,
    getTileRingIndex,
    isMainViewReady,
  };
}
