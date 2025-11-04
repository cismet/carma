import { Scene } from "cesium";
export { Scene };

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
