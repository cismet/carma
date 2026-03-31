import { ZERO_PI } from "@carma/units/helpers";

import {
  isCameraStateHeadingPitchRoll,
  isCameraStateRecord,
} from "../../carma-guards";
import {
  Camera,
  Cartesian3,
  PerspectiveFrustum,
  type HeadingPitchRollValues,
} from "../../cesium";
import { writePerspectiveFrustumVerticalFov } from "./PerspectiveFrustumFov";
import type { CameraState, DirectionUp } from "./Types";
type CameraViewWriter = {
  setView: NonNullable<Camera["setView"]>;
  frustum?: Camera["frustum"];
};

/**
 * Restore camera state from CameraState (for crash recovery).
 */
export const setViewFromCameraState = (
  camera: CameraViewWriter,
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
    writePerspectiveFrustumVerticalFov(camera.frustum, state.fov);
  }
};
