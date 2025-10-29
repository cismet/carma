import type { Scene } from "@carma/cesium";
import { ScreenSpaceEventHandler, ScreenSpaceEventType } from "@carma/cesium";

export const screenSpaceEventHandlerOnUserInteraction = (
  scene: Scene,
  callback: () => void
) => {

  const inputHandler = new ScreenSpaceEventHandler(scene.canvas);

  inputHandler.setInputAction(callback, ScreenSpaceEventType.LEFT_DOWN);
  inputHandler.setInputAction(callback, ScreenSpaceEventType.MIDDLE_DOWN);
  inputHandler.setInputAction(callback, ScreenSpaceEventType.RIGHT_DOWN);

  return () => {
    inputHandler.destroy();
  };
};
