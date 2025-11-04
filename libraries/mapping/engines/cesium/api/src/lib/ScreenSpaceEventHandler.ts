import { ScreenSpaceEventHandler } from "cesium";
export { ScreenSpaceEventHandler };

export const isValidScreenSpaceEventHandler = (
  handler: unknown
): handler is ScreenSpaceEventHandler =>
  handler instanceof ScreenSpaceEventHandler && handler.isDestroyed() === false;
