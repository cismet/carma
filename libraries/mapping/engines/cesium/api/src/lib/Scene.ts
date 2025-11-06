import { Scene } from "cesium";
export { Scene };

/**
 * Cesium Scene render stage events in execution order
 */
export type SceneRenderStage =
  | "preUpdate"
  | "postUpdate"
  | "preRender"
  | "postRender";

export const isValidScene = (scene: unknown): scene is Scene =>
  scene instanceof Scene && scene.isDestroyed() === false;

/**
 * Validates a Scene and executes a callback if valid
 */
export const tryWithValidScene = (
  scene: unknown,
  cb: (scene: Scene) => void,
  label: string = "scene"
) => {
  if (!isValidScene(scene)) {
    console.error(`tryWithValidScene had invalid Scene ${label}`);
    return;
  }
  try {
    cb(scene);
  } catch (e) {
    console.error(`tryWithValidScene failed on ${label}`, e);
  }
};

/**
 * Waits for N Cesium render frames to complete at a specific render stage
 * Useful for ensuring WebGL state is stable after React re-renders
 *
 * @param scene - The Cesium Scene
 * @param frameCount - Number of render frames to wait (default: 2)
 * @param stage - Render stage to wait for (default: "postRender")
 * @returns Promise that resolves after the specified frames
 *
 * @example
 * // Wait for 2 frames after render completes (safest for GL operations)
 * await waitForRenderFrames(scene, 2, "postRender");
 *
 * @example
 * // Wait for 1 frame before render starts (for pre-render setup)
 * await waitForRenderFrames(scene, 1, "preRender");
 */
export const waitForRenderFrames = (
  scene: Scene,
  frameCount: number = 2,
  stage: SceneRenderStage = "postRender"
): Promise<void> => {
  return new Promise<void>((resolve) => {
    let count = 0;
    const listener = () => {
      count++;
      if (count >= frameCount) {
        scene[stage].removeEventListener(listener);
        resolve();
      } else {
        // Request next frame in requestRenderMode
        scene.requestRender();
      }
    };
    scene[stage].addEventListener(listener);
    // Trigger first render
    scene.requestRender();
  });
};
