import type { Scene } from "@carma/cesium";

export const screenSpaceEventHandlerOnUserInteraction = async (
  scene: Scene,
  callback: () => void
) => {
  // lazy load Cesium
  const { ScreenSpaceEventHandler, ScreenSpaceEventType } = await import(
    "@carma/cesium"
  );

  const inputHandler = new ScreenSpaceEventHandler(scene.canvas);

  inputHandler.setInputAction(callback, ScreenSpaceEventType.LEFT_DOWN);
  inputHandler.setInputAction(callback, ScreenSpaceEventType.MIDDLE_DOWN);
  inputHandler.setInputAction(callback, ScreenSpaceEventType.RIGHT_DOWN);

  return () => {
    inputHandler.destroy();
  };
};
