import { Quaternion } from "three";

import { readLocalCameraBasis } from "@carma-commons/camera/model";
import { clamp } from "@carma-commons/math";
import type { Radians } from "@carma-units";

import { deriveAnchoredRoll } from "./anchoredOrbit";
const MIN_HORIZONTAL_VECTOR_LENGTH_SQ = 1e-12;

export const deriveAnchoredBearingPitchFromOrientation = (
  orientation: Quaternion
): { bearing: Radians; pitch: Radians } => {
  const basis = readLocalCameraBasis(orientation);
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

export const deriveAnchoredViewAnglesFromOrientation = (
  orientation: Quaternion
): { bearing: Radians; pitch: Radians; roll: Radians } => {
  const { bearing, pitch } =
    deriveAnchoredBearingPitchFromOrientation(orientation);

  return {
    bearing,
    pitch,
    roll: deriveAnchoredRoll({
      orientation,
      bearing,
      pitch,
    }),
  };
};
