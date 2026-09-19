import type {
  SharedThreeSceneShadowView,
  TileCameraSnapshot,
} from "@carma-mapping/engines/maplibre";

export const SHADOW_CORRIDOR_CAMERA_ID = "shadow-corridor";

/**
 * The light camera as an extra diagnostic view. Frustum drawing works from the
 * projection and world matrices alone, so an orthographic corridor projects
 * through the same path as the perspective main camera. Display only: the
 * corridor never becomes a registered tile camera, so tile demand and the
 * no-shadow path stay exactly as they are.
 */
export const snapshotShadowCorridorCameras = (
  view: SharedThreeSceneShadowView | null
): readonly TileCameraSnapshot[] => {
  const camera = view?.camera;
  if (!camera) return [];
  camera.updateWorldMatrix(true, false);
  const projectionMatrix = camera.projectionMatrix.toArray();
  const matrixWorld = camera.matrixWorld.toArray();
  if (![...projectionMatrix, ...matrixWorld].every(Number.isFinite)) return [];
  const size = view?.shadowMapSize;
  return [
    {
      id: SHADOW_CORRIDOR_CAMERA_ID,
      projectionMatrix,
      matrixWorld,
      coordinateSystem: camera.coordinateSystem,
      reversedDepth: camera.reversedDepth,
      viewport: [
        Math.max(1, Math.round(size?.width ?? 1)),
        Math.max(1, Math.round(size?.height ?? 1)),
      ],
      errorTargetPixels: 1,
      role: "geometry",
    },
  ];
};
