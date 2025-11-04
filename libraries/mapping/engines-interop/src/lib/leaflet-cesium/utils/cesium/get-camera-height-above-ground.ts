import { Scene, defined } from "@carma/cesium";
import { pickSceneCanvasCenter } from "@carma-mapping/engines/cesium/legacy";

export const getCameraHeightAboveGround = (scene: Scene) => {
  const { scenePosition: pos, coordinates } = pickSceneCanvasCenter(scene, {
    getCoordinates: true,
  });

  const { camera } = scene;

  let cameraHeightAboveGround = 0;
  let groundHeight: number = 0;

  if (defined(pos) && defined(coordinates)) {
    groundHeight = coordinates.height;
    cameraHeightAboveGround = camera.positionCartographic.height - groundHeight;
  } else {
    console.warn("No ground position found under the camera.");
    cameraHeightAboveGround = camera.positionCartographic.height;
  }
  return { cameraHeightAboveGround, groundHeight };
};
