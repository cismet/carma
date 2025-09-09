import { Camera, Scene, Viewer } from "cesium";

export const isValidViewerInstance = (viewer: unknown): viewer is Viewer =>
  viewer instanceof Viewer && viewer.isDestroyed() === false;

const isValidSceneInstance = (scene: unknown): scene is Scene =>
  scene instanceof Scene && scene.isDestroyed() === false;

const isValidCameraInstance = (camera: unknown): camera is Camera =>
  camera instanceof Camera;

const isValidCanvasInstance = (canvas: unknown): canvas is HTMLCanvasElement =>
  canvas instanceof HTMLCanvasElement;

export const isValidViewer = (viewer: Viewer | null): viewer is Viewer => {
  if (!isValidViewerInstance(viewer)) return false;
  if (!viewer.scene || !isValidSceneInstance(viewer.scene)) return false;

  if (!viewer.camera || !isValidCameraInstance(viewer.camera)) return false;
  if (!viewer.canvas || !isValidCanvasInstance(viewer.canvas)) return false;
  return true;
};

/**
 * Validates a Cesium viewer and executes a callback if valid
 */
export const withValidViewer = (
  viewer: Viewer | null,
  cb: (viewer: Viewer) => void
) => {
  isValidViewer(viewer) && cb(viewer);
};
