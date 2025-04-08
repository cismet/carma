import { Matrix4, type Viewer } from "cesium";

export const resetCamera = (viewer: Viewer) => {
  viewer.camera.lookAtTransform(Matrix4.IDENTITY);
  viewer.scene.requestRender();
};
