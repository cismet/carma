import * as THREE from "three";

import { TILES_LOAD_POLICY } from "../../core/tile-load-config";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import type { RuntimeTile } from "./three-tiles-runtime-types";

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
    | "ringFrustums"
    | "tileViewFrustum"
    | "tileViewProjection"
    | "tiles"
    | "viewFrustumsReady"
  >,
  viewportFocusNdc: THREE.Vector3,
  resetCaches: () => void
) {
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
        const halfTan = Math.tan(THREE.MathUtils.degToRad(viewCamera.fov / 2));
        TILES_LOAD_POLICY.idleRingTanMultipliers.forEach((multiplier, k) => {
          runtimeState.marginCamera.fov = Math.min(
            175,
            2 * THREE.MathUtils.radToDeg(Math.atan(halfTan * multiplier))
          );
          runtimeState.marginCamera.updateProjectionMatrix();
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
            .multiply(runtimeState.tiles!.group.matrixWorld);
          runtimeState.ringFrustums[k].setFromProjectionMatrix(
            runtimeState.marginProjection,
            viewCamera.coordinateSystem,
            viewCamera.reversedDepth
          );
        });
      } else {
        runtimeState.marginFrustum.copy(runtimeState.tileViewFrustum);
        for (const frustum of runtimeState.ringFrustums)
          frustum.copy(runtimeState.tileViewFrustum);
      }
      runtimeState.viewFrustumsReady = true;
    };

  const isTileInPrefetchMargin: ThreeTilesRuntimeServices["isTileInPrefetchMargin"] =
    (tile: RuntimeTile): boolean => {
      const bounds = tile.engineData?.boundingVolume;
      if (!bounds || !runtimeState.viewFrustumsReady) return false;
      return bounds.intersectsFrustum(runtimeState.marginFrustum);
    };

  const getTileRingIndex: ThreeTilesRuntimeServices["getTileRingIndex"] = (
    tile: RuntimeTile
  ): number => {
    const bounds = tile.engineData?.boundingVolume;
    if (!bounds || !runtimeState.viewFrustumsReady) return 0;
    for (let k = 0; k < runtimeState.ringFrustums.length; k++)
      if (bounds.intersectsFrustum(runtimeState.ringFrustums[k])) return k + 1;
    // The last ring is the whole model at the coarsest level of the cascade,
    // so nothing of the extent is ever unloaded below that level.
    return runtimeState.ringFrustums.length + 1;
  };

  return {
    prepareViewFrustums,
    isTileInPrefetchMargin,
    getTileRingIndex,
  };
}
