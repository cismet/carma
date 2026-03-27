import { Scene } from "../../cesium";
import { isValidScene } from "../../carma-guards";

/**
 * Validates a Scene and executes a callback if valid.
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
