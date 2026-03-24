import { Matrix4, Quaternion, Vector3, isZeroish } from "@carma/math";
import type { Meters, Radians } from "@carma/units/types";

const LOCAL_RIGHT = new Vector3(1, 0, 0);
const LOCAL_UP = new Vector3(0, 1, 0);
const LOCAL_FORWARD = new Vector3(0, 0, -1);
const LOCAL_ROLL_AXIS = new Vector3(0, 0, 1);
const NADIR_HORIZONTAL_EPSILON_M = 1e-6;

export type ObjectCentricEnuOffset = {
  east: number;
  north: number;
  up: number;
};

export type ObjectCentricOrbit = {
  bearing: Radians;
  pitch: Radians;
  range: Meters;
};

export type ObjectCentricOrientationInput = {
  bearing: Radians;
  pitch: Radians;
  roll?: Radians;
};

export type ObjectCentricCameraBasis = {
  forward: Vector3;
  right: Vector3;
  up: Vector3;
};

export const objectCentricOrbitToEnuOffset = ({
  bearing,
  pitch,
  range,
}: ObjectCentricOrbit): ObjectCentricEnuOffset => {
  const cesiumPitch = (pitch as number) - Math.PI * 0.5;
  const cosPitch = Math.cos(cesiumPitch);
  const sinPitch = Math.sin(cesiumPitch);
  const offsetBearing = (bearing as number) + Math.PI;

  return {
    east: Math.sin(offsetBearing) * cosPitch * (range as number),
    north: Math.cos(offsetBearing) * cosPitch * (range as number),
    up: -sinPitch * (range as number),
  };
};

export const enuOffsetToObjectCentricOrbit = ({
  east,
  north,
  up,
}: ObjectCentricEnuOffset): ObjectCentricOrbit => {
  const range = Math.hypot(east, north, up);
  const horizontalDist = Math.hypot(east, north);
  const bearing = isZeroish(horizontalDist, NADIR_HORIZONTAL_EPSILON_M)
    ? 0
    : Math.atan2(-east, -north);
  const cesiumPitch = -Math.atan2(up, horizontalDist);
  const pitch = cesiumPitch + Math.PI * 0.5;

  return {
    bearing: bearing as Radians,
    pitch: pitch as Radians,
    range: range as Meters,
  };
};

export const buildObjectCentricOrientationQuaternion = ({
  bearing,
  pitch,
  roll,
}: ObjectCentricOrientationInput): Quaternion => {
  const cesiumPitch = (pitch as number) - Math.PI * 0.5;
  const orientation = new Quaternion()
    .setFromAxisAngle(LOCAL_UP, -(bearing as number))
    .multiply(new Quaternion().setFromAxisAngle(LOCAL_RIGHT, cesiumPitch));

  if (
    typeof roll === "number" &&
    Number.isFinite(roll) &&
    Math.abs(roll) > 1e-8
  ) {
    orientation.multiply(
      new Quaternion().setFromAxisAngle(LOCAL_ROLL_AXIS, roll)
    );
  }

  return orientation;
};

export const readObjectCentricCameraBasis = (
  orientation: Quaternion
): ObjectCentricCameraBasis => {
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

export const buildObjectCentricOrientationQuaternionFromBasis = ({
  forward,
  right,
  up,
}: ObjectCentricCameraBasis): Quaternion =>
  new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(
      right.clone().normalize(),
      up.clone().normalize(),
      forward.clone().negate().normalize()
    )
  );

export const deriveObjectCentricRoll = ({
  orientation,
  bearing,
  pitch,
}: {
  orientation: Quaternion;
  bearing: Radians;
  pitch: Radians;
}): Radians => {
  const expected = buildObjectCentricOrientationQuaternion({
    bearing,
    pitch,
  });
  const diff = expected.clone().conjugate().multiply(orientation);
  const rollAngle =
    2 *
    Math.atan2(
      Math.sqrt(diff.x * diff.x + diff.y * diff.y + diff.z * diff.z),
      Math.abs(diff.w)
    );

  return (diff.z < 0 ? -rollAngle : rollAngle) as Radians;
};
