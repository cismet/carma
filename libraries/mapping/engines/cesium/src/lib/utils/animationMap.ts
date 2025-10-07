import { type Scene, Matrix4 } from "cesium";

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
export type AnimationMap = WeakMap<Scene, AnimationMapEntry>;

export const initAnimationMap = (): AnimationMap =>
  new WeakMap<Scene, AnimationMapEntry>();

export const cancelAnimation = (
  scene: Scene,
  animationMap: AnimationMap | null
) => {
  if (!animationMap) return;
  if (!isValidScene(scene)) return;
  try {
    const animationEntry = animationMap.get(scene);
    if (animationEntry) {
      cancelAnimationFrame(animationEntry.id);
      // reset any camera transforms
      scene.camera.lookAtTransform(Matrix4.IDENTITY);
      animationMap.delete(scene);
      console.debug(
        `Canceling animation of type ${animationEntry.type}`,
        animationEntry.id
      );
    }
    // Request a render to update the scene
    scene.requestRender();
  } catch (error) {
    console.error("Failed to cancel animation", error);
  }
};
