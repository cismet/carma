import { ZERO_PI } from "@carma/units/helpers";
import {
  Camera,
  Cartesian3,
  Matrix4,
  PerspectiveFrustum,
  type HeadingPitchRollValues,
} from "../../cesium";
import {
  isCameraStateHeadingPitchRoll,
  isCameraStateRecord,
} from "../../carma-guards";
import { captureCurrentCameraState } from "./CameraStateCapture";
import type { CameraState, DirectionUp } from "./CameraTypes";

/**
 * Restore camera state from CameraState (for crash recovery).
 */
export const setViewFromCameraState = (
  camera: Camera,
  state: CameraState
): void => {
  const isHeadingPitchRollState = isCameraStateHeadingPitchRoll(state);

  if (isCameraStateRecord(state)) {
    const { position, direction, up, right } = state;
    const destination = position;
    const orientation: DirectionUp = {
      direction,
      up,
    };
    if (right) {
      orientation.right = right;
    }
    camera.setView({ destination, orientation });
  } else if (isHeadingPitchRollState) {
    const destination = Cartesian3.fromRadians(
      state.longitude,
      state.latitude,
      state.altitude
    );
    const orientation: HeadingPitchRollValues = {
      heading: state.heading,
      pitch: state.pitch,
      roll: ZERO_PI,
    };

    if (state.roll !== undefined) {
      orientation.roll = state.roll;
    }
    camera.setView({ destination, orientation });
  } else {
    console.error("Invalid camera state format for recovery");
    return;
  }

  if (state.fov !== undefined && camera.frustum instanceof PerspectiveFrustum) {
    camera.frustum.fov = state.fov;
  }
};

/**
 * Release camera from orbit/lookAt mode while preserving current position.
 */
export const releaseCameraFromOrbitMode = (camera: Camera): void => {
  const state = captureCurrentCameraState(camera, false);

  camera.lookAtTransform(Matrix4.IDENTITY);

  if (state.position) camera.position = state.position;
  if (state.direction) camera.direction = state.direction;
  if (state.up) camera.up = state.up;
  if (state.right) camera.right = state.right;
};
