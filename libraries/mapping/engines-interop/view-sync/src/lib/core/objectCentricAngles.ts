import { clamp, Quaternion } from "@carma/math";
import {
  readObjectCentricCameraBasis,
  deriveObjectCentricRoll,
} from "@carma-commons/camera/model";
import type { Radians } from "@carma/units/types";

const MIN_HORIZONTAL_VECTOR_LENGTH_SQ = 1e-12;

export const deriveObjectCentricBearingPitchFromOrientation = (
  orientation: Quaternion
): { bearing: Radians; pitch: Radians } => {
  const basis = readObjectCentricCameraBasis(orientation);
  const horizontalBearingVector =
    basis.forward.x * basis.forward.x + basis.forward.z * basis.forward.z >
    MIN_HORIZONTAL_VECTOR_LENGTH_SQ
      ? basis.forward
      : basis.up.x * basis.up.x + basis.up.z * basis.up.z >
        MIN_HORIZONTAL_VECTOR_LENGTH_SQ
      ? basis.up
      : basis.right;
  const bearing = Math.atan2(
    horizontalBearingVector.x,
    -horizontalBearingVector.z
  ) as Radians;
  const pitch = Math.acos(clamp(-basis.forward.y, -1, 1)) as Radians;

  return {
    bearing,
    pitch,
  };
};

export const deriveObjectCentricViewAnglesFromOrientation = (
  orientation: Quaternion
): { bearing: Radians; pitch: Radians; roll: Radians } => {
  const { bearing, pitch } =
    deriveObjectCentricBearingPitchFromOrientation(orientation);

  return {
    bearing,
    pitch,
    roll: deriveObjectCentricRoll({
      orientation,
      bearing,
      pitch,
    }),
  };
};
