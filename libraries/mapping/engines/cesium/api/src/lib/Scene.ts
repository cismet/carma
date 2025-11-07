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
  frameCount: number = 1,
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

/**
 * Waits until a condition is met or maximum frames reached
 * Checks condition after each render frame at specified stage
 *
 * @param scene - The Cesium Scene
 * @param conditionCallback - Function that receives scene and current frame count, returns true when condition is met
 * @param maxFrames - Maximum frames to wait before giving up (default: 10)
 * @param stage - Render stage to check condition at (default: "postRender")
 * @returns Promise that resolves with true if condition met, false if max frames reached
 *
 * @example
 * // Wait for WebGL buffer to be ready (max 10 frames)
 * const isReady = await waitForCondition(
 *   scene,
 *   (scene, frameCount) => {
 *     const gl = scene.context._gl;
 *     console.debug(`Frame ${frameCount}: buffer ${gl.drawingBufferWidth}x${gl.drawingBufferHeight}`);
 *     return gl.drawingBufferWidth > 0;
 *   },
 *   10
 * );
 * if (!isReady) {
 *   console.warn('Buffer not ready after 10 frames, using fallback');
 * }
 *
 * @example
 * // Wait for specific resource to load
 * const loaded = await waitForCondition(
 *   scene,
 *   (scene, frame) => tileset.ready,
 *   20,
 *   "postUpdate"
 * );
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
      frameCount++;

      // Check if condition is met
      if (conditionCallback(scene, frameCount)) {
        scene[stage].removeEventListener(listener);
        resolve(true);
        return;
      }

      // Check if max frames reached
      if (frameCount >= maxFrames) {
        scene[stage].removeEventListener(listener);
        resolve(false);
        return;
      }

      // Request next frame
      scene.requestRender();
    };

    scene[stage].addEventListener(listener);
    // Trigger first render
    scene.requestRender();
  });
};

/**
 * @param scene - The Cesium Scene
 * @param frames - Number of frames to wait (default: 1)
 * @returns Promise that resolves when scene is ready
 * @throws Error if scene becomes invalid during wait
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
