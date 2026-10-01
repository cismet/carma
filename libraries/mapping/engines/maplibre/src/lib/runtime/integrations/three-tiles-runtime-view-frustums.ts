import * as THREE from "three";

import { TILES_LOAD_POLICY } from "../../core/tile-load-config";
import { isMeshTileUnconditionallyRefined } from "../../core/mesh-tile-coverage";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import type { RuntimeTile } from "./three-tiles-runtime-types";
import {
  intersectsTileFrustumMargin,
  readOrientedTileBounds,
  type TileBoundsVolume,
} from "./three-tiles-bounds";
import { createRootTileDomainClip } from "./three-tiles-root-domain";

/** Prepares native traversal frustums and idle coverage rings for a view. */
export function createThreeTilesViewFrustums(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    | "lastMainViewProjection"
    | "mainViewIntersectionCache"
    | "mainViewProjectionChanged"
    | "marginCamera"
    | "marginFrustum"
    | "marginProjection"
    | "offsetGroup"
    | "options"
    | "ringFrustums"
    | "tileViewFrustum"
    | "tileViewProjection"
    | "tiles"
    | "viewFrustumsReady"
  >,
  viewportFocusNdc: THREE.Vector3,
  resetCaches: () => void
) {
  const clipRootDomain = createRootTileDomainClip(
    () => runtimeState.tiles?.root
  );
  const queryBounds = new THREE.Box3();
  const queryTransform = new THREE.Matrix4();
  const intersectsDomainFrustum = (
    volume: TileBoundsVolume & {
      intersectsFrustum?: (frustum: THREE.Frustum) => boolean;
    },
    frustum: THREE.Frustum
  ) => {
    if (volume.intersectsFrustum && !volume.intersectsFrustum(frustum))
      return false;
    if (!volume.getAABB) return true;
    readOrientedTileBounds(volume, queryBounds, queryTransform);
    return (
      clipRootDomain(queryBounds, queryTransform) &&
      intersectsTileFrustumMargin(queryBounds, queryTransform, frustum, 0)
    );
  };
  /** Main-view and prefetch-margin frustums in the tiles group frame. */
  const prepareViewFrustums: ThreeTilesRuntimeServices["prepareViewFrustums"] =
    (viewCamera: THREE.Camera) => {
      if (!runtimeState.tiles) return;
      // Scope native camera-error memoization to this audit, never a prior drag.
      resetCaches();
      // Refresh the parents directly, then let TilesGroup recompute its own
      // world matrix so its cached inverse (used by the traversal) stays in sync.
      runtimeState.offsetGroup.updateWorldMatrix(true, false);
      runtimeState.tiles.group.updateMatrixWorld(true);
      viewCamera.updateWorldMatrix(true, false);
      // Retention and request priorities read native SSE before tiles.update().
      // Refresh its cameraInfo now, or this audit memoizes the previous zoom.
      runtimeState.tiles.prepareForTraversal();
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
      viewportFocusNdc.set(0, 0, -1).applyMatrix4(viewCamera.projectionMatrix);
      if (viewCamera instanceof THREE.PerspectiveCamera) {
        runtimeState.marginCamera.fov =
          viewCamera.fov * TILES_LOAD_POLICY.prefetchMarginFovFactor;
        runtimeState.marginCamera.aspect = viewCamera.aspect;
        runtimeState.marginCamera.near = viewCamera.near;
        runtimeState.marginCamera.far = viewCamera.far;
        runtimeState.marginCamera.zoom = viewCamera.zoom;
        runtimeState.marginCamera.updateProjectionMatrix();
        // Widen around the same principal point: padding shifts the optical
        // axis inside the full viewport, including all padded edge coverage.
        runtimeState.marginCamera.projectionMatrix.elements[8] =
          viewCamera.projectionMatrix.elements[8];
        runtimeState.marginCamera.projectionMatrix.elements[9] =
          viewCamera.projectionMatrix.elements[9];
        runtimeState.marginCamera.projectionMatrixInverse
          .copy(runtimeState.marginCamera.projectionMatrix)
          .invert();
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
      // Expand the actual projection, preserving its principal point, depth
      // mapping and camera model. The rings also work for orthographic views.
      TILES_LOAD_POLICY.idleRingTanMultipliers.forEach((multiplier, index) => {
        runtimeState.marginProjection.copy(viewCamera.projectionMatrix);
        runtimeState.marginProjection.elements[0] /= multiplier;
        runtimeState.marginProjection.elements[5] /= multiplier;
        runtimeState.marginProjection
          .multiply(viewCamera.matrixWorldInverse)
          .multiply(runtimeState.tiles!.group.matrixWorld);
        runtimeState.ringFrustums[index].setFromProjectionMatrix(
          runtimeState.marginProjection,
          viewCamera.coordinateSystem,
          viewCamera.reversedDepth
        );
      });
      runtimeState.viewFrustumsReady = true;
    };

  const isTileInPrefetchMargin: ThreeTilesRuntimeServices["isTileInPrefetchMargin"] =
    (tile: RuntimeTile): boolean => {
      const bounds = tile.engineData?.boundingVolume;
      if (!bounds || !runtimeState.viewFrustumsReady) return false;
      if (runtimeState.options.providesTerrain)
        return getTileRingIndex(tile) === 1;
      return intersectsDomainFrustum(bounds, runtimeState.marginFrustum);
    };

  const getTileRingIndex: ThreeTilesRuntimeServices["getTileRingIndex"] = (
    tile: RuntimeTile
  ): number => {
    let bounds = tile.engineData?.boundingVolume;
    if (!runtimeState.viewFrustumsReady) return 0;
    if (bounds?.getAABB) {
      readOrientedTileBounds(bounds, queryBounds, queryTransform);
      if (!clipRootDomain(queryBounds, queryTransform)) return 0;
    }
    // Background siblings share their nearest drawable REPLACE family's ring.
    // Routing nodes do not introduce another LOD; ADD content remains distinct.
    for (let parent = tile.parent; parent; parent = parent.parent) {
      if (
        !parent.internal?.hasRenderableContent ||
        isMeshTileUnconditionallyRefined(parent)
      )
        continue;
      if (parent.refine === "REPLACE")
        bounds = (parent as RuntimeTile).engineData?.boundingVolume ?? bounds;
      break;
    }
    if (!bounds) return 0;
    for (let index = 0; index < runtimeState.ringFrustums.length; index++)
      if (intersectsDomainFrustum(bounds, runtimeState.ringFrustums[index]))
        return index + 1;
    // Beyond the last ring, whole-extent floor coverage remains the reserve.
    return runtimeState.ringFrustums.length + 1;
  };

  return {
    prepareViewFrustums,
    isTileInPrefetchMargin,
    getTileRingIndex,
  };
}
