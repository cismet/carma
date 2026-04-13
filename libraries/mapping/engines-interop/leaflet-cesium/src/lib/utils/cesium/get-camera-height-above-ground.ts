import { CesiumTerrainProvider, Scene, defined } from "@carma-cesium";
import { sampleTerrainMostDetailedGuardedAsync } from "@carma-mapping/engines/cesium/core";

export const getCameraHeightAboveGroundAsync = async (
  scene: Scene,
  terrainProvider: CesiumTerrainProvider
) => {
  const { camera } = scene;

  const [cameraGroundPos] = await sampleTerrainMostDetailedGuardedAsync(
    terrainProvider,
    [camera.positionCartographic]
  );

  let groundHeight: number;
  let cameraHeightAboveGround: number;

  if (defined(cameraGroundPos)) {
    groundHeight = cameraGroundPos.height;
    cameraHeightAboveGround = camera.positionCartographic.height - groundHeight;
    console.debug(
      "Camera ground position found",
      cameraGroundPos,
      camera.positionCartographic.height,
      "Camera height above ground:",
      cameraHeightAboveGround
    );
  } else {
    console.warn(
      "No ground position found under the camera, using camera height to stay above ground."
    );
    cameraHeightAboveGround = camera.positionCartographic.height;
  }
  return { cameraHeightAboveGround, groundHeight };
};
