// Re-export ScreenSpaceCameraController class from Cesium
import { ScreenSpaceCameraController } from "cesium";
export { ScreenSpaceCameraController };

export const isValidScreenSpaceCameraController = (
  sscc: unknown
): sscc is ScreenSpaceCameraController =>
  sscc instanceof ScreenSpaceCameraController && sscc.isDestroyed() === false;
