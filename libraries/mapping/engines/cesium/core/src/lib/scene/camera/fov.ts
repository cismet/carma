import type { Degrees, Radians, Ratio } from "@carma/units/types";
import { clamp, isUnitRangeRatio, degToRad } from "@carma/units/helpers";
import { geometricScale } from "@carma-commons/math";

// min supported fov
export const DEFAULT_MIN_FOV = degToRad(1 as Degrees);
// max supported fov
export const DEFAULT_MAX_FOV = degToRad(179 as Degrees);

export const DEFAULT_FOV_CHANGE_RATE = 0.0008 as Ratio; // compounds fast
export const DEFAULT_MIN_FOV_CHANGE = 0.0001 as Radians;

export const isValidFov = (fov: unknown): fov is Radians => {
  return (
    typeof fov === "number" && fov >= DEFAULT_MIN_FOV && fov <= DEFAULT_MAX_FOV
  );
};

export const computeNextFov = (
  current: Radians,
  steps: number,
  min: Radians,
  max: Radians,
  stepFraction: Ratio
): Radians => {
  if (!isValidFov(current)) throw new Error("computeNextFov: invalid fov");
  if (!isValidFov(min)) throw new Error("computeNextFov: invalid min fov");
  if (!isValidFov(max)) throw new Error("computeNextFov: invalid max fov");
  if (!isUnitRangeRatio(stepFraction))
    throw new Error("computeNextFov: invalid step fraction");
  const target = geometricScale(current, stepFraction, steps) as Radians;
  return clampToValidFov(target);
};

export const clampToValidFov = (fov: Radians): Radians => {
  return clamp(fov, DEFAULT_MIN_FOV, DEFAULT_MAX_FOV) as Radians;
};
