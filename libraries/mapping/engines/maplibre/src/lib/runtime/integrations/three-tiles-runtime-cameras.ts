import type { Camera } from "three";
import { getReadyMeshRegionCut } from "../../core/mesh-tile-coverage";
import {
  snapshotTileCameraViews,
  TILE_CAMERA_ROLE,
  TILE_MAIN_OBSERVER_ID,
  type TileCameraSnapshot,
} from "../../core/tile-camera-demand";
import type {
  ThreeTilesFrameRuntimeState,
  ThreeTilesFrameDependencies,
} from "./three-tiles-runtime-frame-types";
import type { RuntimeTile } from "./three-tiles-runtime-types";

/** Prove final-target coverage over the hierarchy, including missing branches.
 * This gates only background work; each foreground family progresses locally.
 */
export const areActiveMeshViewsConverged = (
  runtimeState: ThreeTilesFrameRuntimeState,
  dependencies: Pick<
    ThreeTilesFrameDependencies,
    "getTileCameraDemand" | "mainViewWithinErrorFactor"
  >
): boolean => {
  const root = runtimeState.tiles?.root;
  if (!runtimeState.tiles) return false;
  return runtimeState.options.providesTerrain
    ? !!root &&
        !runtimeState.pendingMeshReceiverFrontier?.size &&
        dependencies.mainViewWithinErrorFactor(
          Math.max(
            runtimeState.requestedErrorTarget,
            runtimeState.memoryErrorTarget
          ) / runtimeState.effectiveErrorTarget,
          false
        ) &&
        getReadyMeshRegionCut(
          root,
          new Set([
            ...runtimeState.displayedMeshFrontier,
            ...runtimeState.committedMeshCasterFrontier,
            ...runtimeState.tiles.visibleTiles,
          ]),
          1,
          (tile) => {
            if (!(tile as RuntimeTile).engineData?.boundingVolume?.getAABB)
              return {
                intersects: true,
                errorPixels: Number.POSITIVE_INFINITY,
              };
            const demand = dependencies.getTileCameraDemand(
              tile as RuntimeTile,
              true
            );
            return {
              intersects: demand.required,
              errorPixels: demand.errorRatio,
            };
          }
        ) !== null &&
        (!runtimeState.shadowView || runtimeState.shadowReceiverMaskConverged)
    : runtimeState.lastMainViewConverged;
};

export const getRuntimeTileCameraViews = (
  runtimeState: ThreeTilesFrameRuntimeState,
  camera: Camera,
  viewport: Readonly<{ x: number; y: number }>,
  additionalViews?: readonly TileCameraSnapshot[]
) => [
  ...snapshotTileCameraViews([
    {
      id: TILE_MAIN_OBSERVER_ID,
      camera: camera,
      viewport: [viewport.x, viewport.y],
      // UNIFIED-VISIBLE-SSE-20260916: sharing a pool must preserve each
      // camera's request, including the main observer's requested target.
      errorTargetPixels:
        runtimeState.options.handoverErrorTargetPixels === undefined &&
        additionalViews?.length
          ? runtimeState.requestedErrorTarget
          : runtimeState.effectiveErrorTarget,
      role: TILE_CAMERA_ROLE.RECEIVER,
    },
  ]),
  // Scheduling rank must not weaken a camera's requested detail.
  // The strictest normalized demand wins wherever volumes overlap.
  ...(additionalViews ?? []),
  // Mesh caster retrieval owns its ray corridors independently of the cameras.
];

export const getRetainedMeshDetailTarget = (
  runtimeState: ThreeTilesFrameRuntimeState,
  additionalCameraCount: number
) =>
  runtimeState.shadowView
    ? Math.max(
        runtimeState.requestedErrorTarget,
        runtimeState.memoryErrorTarget
      )
    : additionalCameraCount
    ? runtimeState.effectiveErrorTarget
    : runtimeState.requestedErrorTarget;
