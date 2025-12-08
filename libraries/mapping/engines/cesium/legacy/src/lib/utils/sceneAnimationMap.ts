import { type Scene, Matrix4 } from "@carma/cesium";

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
export type SceneAnimationMap = WeakMap<Scene, AnimationMapEntry>;

export const initSceneAnimationMap = (): SceneAnimationMap =>
  new WeakMap<Scene, AnimationMapEntry>();

export const cancelSceneAnimation = (
  scene: Scene,
  animationMap: SceneAnimationMap | null
) => {
  if (!animationMap) return;
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
};
