import { OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import { createSpineCameraRig } from "./spine-camera-rig";

export const forward = (camera: PerspectiveCamera | OrthographicCamera) =>
  camera.getWorldDirection(new Vector3());

export const referenceEdge = (
  view: ReturnType<typeof createSpineCameraRig>[number],
  sign: number
) => {
  const camera = view.camera as OrthographicCamera;
  return camera.position
    .clone()
    .addScaledVector(forward(camera), view.distance)
    .addScaledVector(
      new Vector3(1, 0, 0).applyQuaternion(camera.quaternion),
      (sign * (camera.right - camera.left)) / 2
    );
};
