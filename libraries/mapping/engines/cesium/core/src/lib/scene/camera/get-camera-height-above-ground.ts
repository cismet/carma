import { defined, type Scene } from "@carma/cesium";

import { pickSceneCenter } from "../picking/pickers";

export const getCameraHeightAboveGround = (scene: Scene) => {
  const { camera } = scene;
  const { scenePosition: pos, coordinates } = pickSceneCenter(scene, {
    getCoordinates: true,
  });

  let cameraHeightAboveGround = 0;
  let groundHeight: number = 0;

  try {
    if (defined(pos) && defined(coordinates)) {
      groundHeight = coordinates.height;
      cameraHeightAboveGround =
        camera.positionCartographic.height - groundHeight;
    } else {
      console.warn("No ground position found under the camera.");
      cameraHeightAboveGround = camera.positionCartographic.height;
    }
  } catch (error) {
    console.warn("Error getting camera height above ground", error);
  }
  return { cameraHeightAboveGround, groundHeight };
};
