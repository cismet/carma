import { type Scene, Matrix4 } from "cesium";
import { isValidScene } from "@carma-mapping/engines/cesium/api";
import { AnimationMap, AnimationMapEntry } from "@carma/types";

export type { AnimationMap, AnimationMapEntry };

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
