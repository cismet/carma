import { ecefToEnuMatrix } from "@carma/geo/utils";
import { Matrix4, Quaternion, Vector3 } from "three";
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
