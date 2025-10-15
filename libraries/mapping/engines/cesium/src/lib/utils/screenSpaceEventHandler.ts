import {
  type Scene,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from "cesium";

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
