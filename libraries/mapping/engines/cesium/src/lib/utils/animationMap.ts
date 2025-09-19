import { Matrix4 } from "cesium";
import type { CesiumWidget } from "../CesiumContext";

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
export type AnimationMap = WeakMap<CesiumWidget, AnimationMapEntry>;

export const initAnimationMap = (): AnimationMap =>
  new WeakMap<CesiumWidget, AnimationMapEntry>();

export const cancelAnimation = (
  viewer: CesiumWidget,
  AnimationMap: AnimationMap | null
) => {
  if (!AnimationMap) return;
  const animationEntry = AnimationMap.get(viewer);
  if (animationEntry) {
    cancelAnimationFrame(animationEntry.id);
    // reset any camera transforms
    viewer.scene.camera.lookAtTransform(Matrix4.IDENTITY);
    AnimationMap.delete(viewer);
    console.debug(
      `Canceling animation of type ${animationEntry.type}`,
      animationEntry.id
    );
  }
  // Request a render to update the scene
  viewer.scene.requestRender();
};
