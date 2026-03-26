import { Quaternion, Vector3 } from "@carma/math";
import type { Meters, Radians } from "@carma/units/types";

const LOCAL_RIGHT = new Vector3(1, 0, 0);
const LOCAL_UP = new Vector3(0, 1, 0);
const LOCAL_ROLL_AXIS = new Vector3(0, 0, 1);

export type AnchoredEnuOffset = {
  east: number;
  north: number;
  up: number;
};

export type AnchoredOrbit = {
  bearing: Radians;
  pitch: Radians;
  range: Meters;
};

export type AnchoredOrientationInput = {
  bearing: Radians;
  pitch: Radians;
  roll?: Radians;
};

export const anchoredOrbitToEnuOffset = ({
  bearing,
  pitch,
  range,
}: AnchoredOrbit): AnchoredEnuOffset => {
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

export const buildAnchoredOrientationQuaternion = ({
  bearing,
  pitch,
  roll,
}: AnchoredOrientationInput): Quaternion => {
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

export const deriveAnchoredRoll = ({
  orientation,
  bearing,
  pitch,
}: {
  orientation: Quaternion;
  bearing: Radians;
  pitch: Radians;
}): Radians => {
  const expected = buildAnchoredOrientationQuaternion({
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
