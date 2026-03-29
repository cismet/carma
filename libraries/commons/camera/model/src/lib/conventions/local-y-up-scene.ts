import { Matrix4, Vector3 } from "three";

const EAST_IN_ENU = new Vector3(1, 0, 0);
const UP_IN_ENU = new Vector3(0, 0, 1);
const SOUTH_IN_ENU = new Vector3(0, -1, 0);

const _localYUpSceneToEnuRotation = new Matrix4().makeBasis(
  EAST_IN_ENU,
  UP_IN_ENU,
  SOUTH_IN_ENU
);
const _enuToLocalYUpSceneRotation = _localYUpSceneToEnuRotation
  .clone()
  .transpose();

const _rotationScratch = new Matrix4();

export const readLocalYUpSceneToEnuRotationMatrix = (
  out: Matrix4 = new Matrix4()
): Matrix4 => out.copy(_localYUpSceneToEnuRotation);

export const readEnuToLocalYUpSceneRotationMatrix = (
  out: Matrix4 = new Matrix4()
): Matrix4 => out.copy(_enuToLocalYUpSceneRotation);

export const enuDirectionToLocalYUpSceneDirection = (
  direction: Vector3,
  out: Vector3 = direction.clone()
): Vector3 =>
  out
    .copy(direction)
    .transformDirection(readEnuToLocalYUpSceneRotationMatrix(_rotationScratch));

export const localYUpSceneDirectionToEnuDirection = (
  direction: Vector3,
  out: Vector3 = direction.clone()
): Vector3 =>
  out
    .copy(direction)
    .transformDirection(readLocalYUpSceneToEnuRotationMatrix(_rotationScratch));
