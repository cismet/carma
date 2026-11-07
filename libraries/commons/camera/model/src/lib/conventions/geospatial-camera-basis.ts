import { Matrix4, Quaternion, Vector3 } from "three";

import { clamp, removeVector3ComponentAlongAxis } from "@carma-commons/math";
import { ecefToEnuMatrix } from "@carma-geo/proj";
import type { Radians } from "@carma-units";

import {
  buildOrientationQuaternionFromLocalCameraBasis,
  type LocalCameraBasis,
} from "./local-camera-basis";
import {
  enuDirectionToLocalYUpSceneDirection,
  localYUpSceneDirectionToEnuDirection,
} from "./local-y-up-scene";
const _ecefToEnuScratch = new Matrix4();
const _enuToEcefScratch = new Matrix4();

export const worldDirectionToLocalYUpSceneDirectionAtAnchor = (
  direction: Vector3,
  anchor: Vector3,
  out: Vector3 = direction.clone()
): Vector3 => {
  const enuVector = out
    .copy(direction)
    .transformDirection(ecefToEnuMatrix(anchor, _ecefToEnuScratch));

  return enuDirectionToLocalYUpSceneDirection(enuVector, out);
};

export const localYUpSceneDirectionToWorldDirectionAtAnchor = (
  direction: Vector3,
  anchor: Vector3,
  out: Vector3 = direction.clone()
): Vector3 => {
  const enuVector = localYUpSceneDirectionToEnuDirection(direction, out);
  const enuToEcef = _enuToEcefScratch
    .copy(ecefToEnuMatrix(anchor, _ecefToEnuScratch))
    .invert();

  return enuVector.transformDirection(enuToEcef).normalize();
};

export const buildOrientationQuaternionFromWorldCameraBasisAtAnchor = (
  basis: LocalCameraBasis,
  anchor: Vector3
): Quaternion => {
  const localForward = worldDirectionToLocalYUpSceneDirectionAtAnchor(
    basis.forward,
    anchor
  );
  const localRight = worldDirectionToLocalYUpSceneDirectionAtAnchor(
    basis.right,
    anchor
  );
  const localUp = worldDirectionToLocalYUpSceneDirectionAtAnchor(
    basis.up,
    anchor
  );

  const right = localRight.clone().normalize();
  const up = new Vector3().crossVectors(right, localForward).normalize();
  const forward = new Vector3().crossVectors(up, right).normalize();

  return buildOrientationQuaternionFromLocalCameraBasis({
    forward,
    right,
    up,
  });
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
