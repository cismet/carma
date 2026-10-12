import { Vector3 } from "three";
import {
  clamp,
  lerp,
  removeVector3ComponentAlongAxis,
} from "@carma-commons/math";
import { interpolateEcefOnEllipsoid, readEnuAxesAtEcef } from "@carma-geo/proj";
import { PI_OVER_THREE, type Radians } from "@carma-units";

import {
  buildOrientationQuaternionFromLocalCameraBasis,
  readLocalCameraBasis,
} from "./conventions/local-camera-basis";

/** A whole camera in ECEF: eye, unit view direction, unit screen-up (the roll) and vertical field of view. */
export type EcefCameraPose = {
  positionECEF: Vector3;
  directionECEF: Vector3;
  upECEF: Vector3;
  verticalFovRad: Radians;
};

export const DEFAULT_ECEF_CAMERA_FOV_Y: Radians = PI_OVER_THREE;

/** Upright pose at the eye looking at the target; north-up when looking straight down. */
export const createLookAtEcefCameraPose = (
  eyeECEF: Vector3,
  targetECEF: Vector3,
  verticalFovRad: Radians = DEFAULT_ECEF_CAMERA_FOV_Y
): EcefCameraPose | null => {
  const direction = targetECEF.clone().sub(eyeECEF);
  if (!(direction.lengthSq() > 0)) return null;
  direction.normalize();
  const { north, up } = readEnuAxesAtEcef(eyeECEF);
  const reference = Math.abs(up.dot(direction)) > 1 - 1e-12 ? north : up;
  return {
    positionECEF: eyeECEF.clone(),
    directionECEF: direction,
    upECEF: removeVector3ComponentAlongAxis(reference, direction).normalize(),
    verticalFovRad,
  };
};

const orientationOf = (pose: EcefCameraPose) =>
  buildOrientationQuaternionFromLocalCameraBasis({
    forward: pose.directionECEF,
    up: pose.upECEF,
    right: new Vector3().crossVectors(pose.directionECEF, pose.upECEF),
  });

/** The pose a fraction t of the way: along the ellipsoid, slerped orientation, blended field of view. */
export const interpolateEcefCameraPose = (
  from: EcefCameraPose,
  to: EcefCameraPose,
  t: number
): EcefCameraPose => {
  const { forward, up } = readLocalCameraBasis(
    orientationOf(from).slerp(orientationOf(to), t)
  );
  return {
    positionECEF: interpolateEcefOnEllipsoid(
      from.positionECEF,
      to.positionECEF,
      t
    ),
    directionECEF: forward,
    upECEF: up,
    verticalFovRad: lerp(from.verticalFovRad, to.verticalFovRad, t) as Radians,
  };
};

/**
 * Bearing (from north, clockwise), pitch (from nadir) and roll of a view in
 * east-north-up axes. Without roll, screen-up lies in the vertical plane of
 * the view, or points along the bearing when looking straight down.
 */
export const readEnuViewAngles = (
  direction: Vector3,
  screenUp: Vector3,
  axes: { east: Vector3; north: Vector3; up: Vector3 }
): { bearing: Radians; pitch: Radians; roll: Radians } => {
  const verticalShare = direction.dot(axes.up);
  const bearing = Math.atan2(
    direction.dot(axes.east),
    direction.dot(axes.north)
  );
  const level = removeVector3ComponentAlongAxis(axes.up, direction);
  if (level.lengthSq() < 1e-12) {
    level
      .copy(axes.east)
      .multiplyScalar(Math.sin(bearing))
      .addScaledVector(axes.north, Math.cos(bearing));
  }
  level.normalize();
  return {
    bearing: bearing as Radians,
    pitch: Math.acos(clamp(-verticalShare, -1, 1)) as Radians,
    roll: Math.atan2(
      new Vector3().crossVectors(level, screenUp).dot(direction),
      level.dot(screenUp)
    ) as Radians,
  };
};
