import { Matrix4, Quaternion, Vector3 } from "@carma/math";

const LOCAL_RIGHT = new Vector3(1, 0, 0);
const LOCAL_UP = new Vector3(0, 1, 0);
const LOCAL_FORWARD = new Vector3(0, 0, -1);

export type LocalCameraBasis = {
  forward: Vector3;
  right: Vector3;
  up: Vector3;
};

export const readLocalCameraBasis = (
  orientation: Quaternion
): LocalCameraBasis => {
  const forward = LOCAL_FORWARD.clone()
    .applyQuaternion(orientation)
    .normalize();
  const up = LOCAL_UP.clone().applyQuaternion(orientation).normalize();
  const right = LOCAL_RIGHT.clone().applyQuaternion(orientation).normalize();

  return {
    forward,
    up,
    right,
  };
};

export const buildOrientationQuaternionFromLocalCameraBasis = ({
  forward,
  right,
  up,
}: LocalCameraBasis): Quaternion =>
  new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(
      right.clone().normalize(),
      up.clone().normalize(),
      forward.clone().negate().normalize()
    )
  );
