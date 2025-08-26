import { type Viewer, Matrix4 } from "cesium";

export enum AnimationType {
  ResetView = "ResetView",
  Tilt = "Tilt",
  Rotate = "Rotate",
  FovChange = "FovChange",
}

export type AnimationMapEntry = {
  id: number;
  type: AnimationType;
  cancelable: boolean;
  next?: AnimationMapEntry;
};
export type ViewerAnimationMap = WeakMap<Viewer, AnimationMapEntry>;

export const initViewerAnimationMap = (): ViewerAnimationMap =>
  new WeakMap<Viewer, AnimationMapEntry>();

export const cancelViewerAnimation = (
  viewer: Viewer,
  viewerAnimationMap: ViewerAnimationMap
) => {
  const animationEntry = viewerAnimationMap.get(viewer);
  if (animationEntry) {
    cancelAnimationFrame(animationEntry.id);
    // reset any camera transforms
    viewer.scene.camera.lookAtTransform(Matrix4.IDENTITY);
    viewerAnimationMap.delete(viewer);
    console.debug(
      `Canceling animation of type ${animationEntry.type}`,
      animationEntry.id
    );
  }
  // Request a render to update the scene
  viewer.scene.requestRender();
};
