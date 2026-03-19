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
  viewportWidthPx,
  viewportHeightPx,
}: {
  rangeM: number;
  fovRad: number;
  viewportWidthPx?: number;
  viewportHeightPx?: number;
}): number | null => {
  const projectionCenterRadiusPx =
    isFiniteNumber(viewportWidthPx) &&
    isFiniteNumber(viewportHeightPx) &&
    viewportWidthPx > 0 &&
    viewportHeightPx > 0
      ? Math.max(viewportWidthPx, viewportHeightPx) * 0.5
      : DEFAULT_PROJECTION_CENTER_RADIUS_PX;

  if (
    !isFiniteNumber(projectionCenterRadiusPx) ||
    projectionCenterRadiusPx <= 0
  ) {
    return null;
  }

  const tanHalfFov = Math.tan(fovRad * 0.5);
  if (!isFiniteNumber(tanHalfFov) || Math.abs(tanHalfFov) < MIN_TAN_HALF_FOV) {
    return null;
  }

  const groundRadiusM = rangeM * Math.abs(tanHalfFov);
  const metersPerCssPixel = groundRadiusM / projectionCenterRadiusPx;
  return isFiniteNumber(metersPerCssPixel) && metersPerCssPixel > 0
    ? metersPerCssPixel
    : null;
};

export const readRangeFromMetersPerCssPixel = ({
  metersPerCssPixel,
  fovRad,
  minRangeM = 0.01,
  viewportWidthPx,
  viewportHeightPx,
}: {
  metersPerCssPixel: number;
  fovRad: number;
  minRangeM?: number;
  viewportWidthPx?: number;
  viewportHeightPx?: number;
}): number | null => {
  const projectionCenterRadiusPx =
    isFiniteNumber(viewportWidthPx) &&
    isFiniteNumber(viewportHeightPx) &&
    viewportWidthPx > 0 &&
    viewportHeightPx > 0
      ? Math.max(viewportWidthPx, viewportHeightPx) * 0.5
      : DEFAULT_PROJECTION_CENTER_RADIUS_PX;

  if (
    !isFiniteNumber(projectionCenterRadiusPx) ||
    projectionCenterRadiusPx <= 0
  ) {
    return null;
  }

  const tanHalfFov = Math.tan(fovRad * 0.5);
  if (!isFiniteNumber(tanHalfFov) || Math.abs(tanHalfFov) < MIN_TAN_HALF_FOV) {
    return null;
  }

  const groundRadiusM = metersPerCssPixel * projectionCenterRadiusPx;
  const rangeM = groundRadiusM / Math.abs(tanHalfFov);
  return isFiniteNumber(rangeM) && rangeM >= minRangeM ? rangeM : null;
};
