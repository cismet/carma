import { isValidCamera } from "../../carma-guards";
import { Camera } from "../../cesium";
/**
 * Validates a Camera and executes a callback if valid.
 */
export const tryWithValidCamera = (
  camera: unknown,
  cb: (camera: Camera) => void,
  label: string = "camera"
) => {
  if (!isValidCamera(camera)) {
    console.error(`tryWithValidCamera had invalid Camera ${label}`);
    return;
  }
  try {
    cb(camera);
  } catch (e) {
    console.error(`tryWithValidCamera failed on ${label}`, e);
  }
};
