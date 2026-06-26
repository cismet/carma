import { isValidScene } from "../../carma-guards";
import { Scene } from "@carma-cesium";
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
  stage: SceneRenderStage = "postRender",
  timeoutMs: number = 4000
): Promise<void> => {
  return new Promise<void>((resolve) => {
    let count = 0;
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    // Hoisted so finish/listener can reference each other.
    function finish() {
      if (settled) return;
      settled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      scene[stage].removeEventListener(listener);
      resolve();
    }

    function listener() {
      // Scene torn down mid-wait — resolve so awaiting callers never hang.
      if (!isValidScene(scene)) {
        finish();
        return;
      }
      count += 1;
      if (count >= frameCount) {
        finish();
      } else {
        scene.requestRender();
      }
    }

    // Fallback: under requestRenderMode a stalled/destroyed scene may never fire
    // postRender again, leaving this promise pending forever.
    timeoutId = setTimeout(finish, timeoutMs);

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
