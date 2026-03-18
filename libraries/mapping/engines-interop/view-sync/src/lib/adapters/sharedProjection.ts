import { isFiniteNumber } from "@carma/math";
import { radToDegNumeric, zeroToTwoPi } from "@carma/units/helpers";
import type { Radians } from "@carma/units/types";

const DEFAULT_PROJECTION_CENTER_RADIUS_PX = 960;
const MIN_TAN_HALF_FOV = 1e-6;

export const normalizeBearingRadToDeg = (bearingRad: number): number =>
  radToDegNumeric(zeroToTwoPi(bearingRad as Radians) as number)!;

export const readMetersPerCssPixel = ({
  rangeM,
  fovRad,
}: {
  rangeM: number;
  fovRad: number;
}): number | null => {
  if (
    !isFiniteNumber(DEFAULT_PROJECTION_CENTER_RADIUS_PX) ||
    DEFAULT_PROJECTION_CENTER_RADIUS_PX <= 0
  ) {
    return null;
  }

  const tanHalfFov = Math.tan(fovRad * 0.5);
  if (!isFiniteNumber(tanHalfFov) || Math.abs(tanHalfFov) < MIN_TAN_HALF_FOV) {
    return null;
  }

  const groundRadiusM = rangeM * Math.abs(tanHalfFov);
  const metersPerCssPixel = groundRadiusM / DEFAULT_PROJECTION_CENTER_RADIUS_PX;
  return isFiniteNumber(metersPerCssPixel) && metersPerCssPixel > 0
    ? metersPerCssPixel
    : null;
};

export const readRangeFromMetersPerCssPixel = ({
  metersPerCssPixel,
  fovRad,
  minRangeM = 0.01,
}: {
  metersPerCssPixel: number;
  fovRad: number;
  minRangeM?: number;
}): number | null => {
  if (
    !isFiniteNumber(DEFAULT_PROJECTION_CENTER_RADIUS_PX) ||
    DEFAULT_PROJECTION_CENTER_RADIUS_PX <= 0
  ) {
    return null;
  }

  const tanHalfFov = Math.tan(fovRad * 0.5);
  if (!isFiniteNumber(tanHalfFov) || Math.abs(tanHalfFov) < MIN_TAN_HALF_FOV) {
    return null;
  }

  const groundRadiusM = metersPerCssPixel * DEFAULT_PROJECTION_CENTER_RADIUS_PX;
  const rangeM = groundRadiusM / Math.abs(tanHalfFov);
  return isFiniteNumber(rangeM) && rangeM >= minRangeM ? rangeM : null;
};
