import { Viewer } from "cesium";

export const isValidViewerInstance = (viewer: unknown): viewer is Viewer =>
  viewer instanceof Viewer &&
  viewer.isDestroyed() === false &&
  viewer.scene !== undefined &&
  viewer.scene.isDestroyed() === false;
