import { CesiumMath } from "@carma/cesium";
import type { Radians, Ratio } from "@carma/units/types";
import { clamp, geometricScale } from "@carma-commons/math";

export const DEFAULT_MIN_FOV = CesiumMath.toRadians(10) as Radians;
export const DEFAULT_MAX_FOV = CesiumMath.toRadians(120) as Radians;
export const DEFAULT_FOV_CHANGE_RATE = 0.0008 as Ratio; // compounds fast
export const DEFAULT_MIN_FOV_CHANGE = 0.0001 as Radians;

export const computeNextFov = (
  current: Radians,
  steps: number,
  min: Radians,
  max: Radians,
  stepFraction: Ratio
): Radians => {
  const target = geometricScale(current, stepFraction, steps) as Radians;
  return clamp(target, min, max) as Radians;
};
