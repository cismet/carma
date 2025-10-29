import { ScreenSpaceCameraController } from "cesium";
export { ScreenSpaceCameraController };

export const isValidScreenSpaceCameraController = (
  controller: unknown
): controller is ScreenSpaceCameraController =>
  controller instanceof ScreenSpaceCameraController &&
  controller.isDestroyed() === false;
