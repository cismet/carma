import { Scene } from "../../cesium";
import { isValidScene } from "../../carma-guards";

/**
 * Cesium Scene render stage events in execution order.
 */
export type SceneRenderStage =
  | "preUpdate"
  | "postUpdate"
  | "preRender"
  | "postRender";

/**
 * Wait for N render frames at a specific stage.
 */
export const waitForRenderFrames = (
  scene: Scene,
  frameCount: number = 1,
  stage: SceneRenderStage = "postRender"
): Promise<void> => {
  return new Promise<void>((resolve) => {
    let count = 0;

    const listener = () => {
      count += 1;
      if (count >= frameCount) {
        scene[stage].removeEventListener(listener);
        resolve();
      } else {
        scene.requestRender();
      }
    };

    scene[stage].addEventListener(listener);
    scene.requestRender();
  });
};

/**
 * Wait until a condition is met or max frame budget is exhausted.
 */
export const waitForCondition = (
  scene: Scene,
  conditionCallback: (scene: Scene, frameCount: number) => boolean,
  maxFrames: number = 10,
  stage: SceneRenderStage = "postRender"
): Promise<boolean> => {
  return new Promise<boolean>((resolve) => {
    let frameCount = 0;

    const listener = () => {
      frameCount += 1;

      if (conditionCallback(scene, frameCount)) {
        scene[stage].removeEventListener(listener);
        resolve(true);
        return;
      }

      if (frameCount >= maxFrames) {
        scene[stage].removeEventListener(listener);
        resolve(false);
        return;
      }

      scene.requestRender();
    };

    scene[stage].addEventListener(listener);
    scene.requestRender();
  });
};

/**
 * Ensure scene remains valid after waiting for N frames.
 */
export const ensureSceneReady = async (
  scene: Scene,
  frames: number = 1
): Promise<void> => {
  await waitForRenderFrames(scene, frames, "postRender");

  if (!isValidScene(scene)) {
    throw new Error("Scene became invalid during waiting");
  }
};
