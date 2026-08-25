import { PerspectiveFrustum, type Scene } from "@carma-cesium";
import {
  readPerspectiveFrustumVerticalFov,
  type SerializedCameraStateHeadingPitchRoll,
} from "@carma-mapping/engines/cesium/core";

/**
 * Snapshot of the outgoing Cesium camera, kept across a 3D->2D handover so the
 * next 2D->3D can restore the orientation it left on. Returns undefined when the
 * camera is not in a readable state.
 */
export const serializeCesiumCameraState = (
  scene: Scene
): SerializedCameraStateHeadingPitchRoll | undefined => {
  const { camera } = scene;
  const cameraCartographic = camera?.positionCartographic;

  if (
    !cameraCartographic ||
    !Number.isFinite(cameraCartographic.longitude) ||
    !Number.isFinite(cameraCartographic.latitude) ||
    !Number.isFinite(cameraCartographic.height) ||
    !Number.isFinite(camera.heading) ||
    !Number.isFinite(camera.pitch)
  ) {
    return undefined;
  }

  return {
    longitude:
      cameraCartographic.longitude as SerializedCameraStateHeadingPitchRoll["longitude"],
    latitude:
      cameraCartographic.latitude as SerializedCameraStateHeadingPitchRoll["latitude"],
    altitude:
      cameraCartographic.height as SerializedCameraStateHeadingPitchRoll["altitude"],
    heading: camera.heading as SerializedCameraStateHeadingPitchRoll["heading"],
    pitch: camera.pitch as SerializedCameraStateHeadingPitchRoll["pitch"],
    ...(Number.isFinite(camera.roll)
      ? { roll: camera.roll as SerializedCameraStateHeadingPitchRoll["roll"] }
      : {}),
    ...(camera.frustum instanceof PerspectiveFrustum &&
    Number.isFinite(readPerspectiveFrustumVerticalFov(camera.frustum))
      ? {
          fov: readPerspectiveFrustumVerticalFov(
            camera.frustum
          ) as SerializedCameraStateHeadingPitchRoll["fov"],
        }
      : {}),
  };
};
