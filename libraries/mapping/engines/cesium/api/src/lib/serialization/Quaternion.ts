import { isFiniteNumber } from "@carma/math";

export type QuaternionJson = {
  x: number;
  y: number;
  z: number;
  w: number;
};

type QuaternionLike = { x: number; y: number; z: number; w: number };

export const isQuaternionJson = (
  value: QuaternionJson | undefined | null
): value is QuaternionJson =>
  !!value &&
  isFiniteNumber(value.x) &&
  isFiniteNumber(value.y) &&
  isFiniteNumber(value.z) &&
  isFiniteNumber(value.w);

export const quaternionToJson = (value: QuaternionLike): QuaternionJson => ({
  x: value.x,
  y: value.y,
  z: value.z,
  w: value.w,
});

export const quaternionFromJson = (value: QuaternionJson): QuaternionLike =>
  ({
    x: value.x,
    y: value.y,
    z: value.z,
    w: value.w,
  } as QuaternionLike);
