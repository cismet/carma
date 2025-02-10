import { Viewer } from "cesium";

export enum AnimationType {
  ResetView = "ResetView",
  Tilt = "Tilt",
  Rotate = "Rotate",
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
    console.info(`Canceling animation of type ${animationEntry.type}`);
    cancelAnimationFrame(animationEntry.id);
    viewerAnimationMap.delete(viewer);
  }
};
