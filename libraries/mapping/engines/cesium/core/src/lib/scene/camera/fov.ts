import type { Degrees, Radians, Ratio } from "@carma/units/types";
import { clamp, isUnitRangeRatio, degToRad } from "@carma/units/helpers";

// FOV bounds - also exported from API (PerspectiveFrustum.ts)
export const DEFAULT_MIN_FOV = degToRad(1 as Degrees);
export const DEFAULT_MAX_FOV = degToRad(179 as Degrees);

// Animation-specific FOV constants (core only)
export const DEFAULT_FOV_CHANGE_RATE = 0.0008 as Ratio; // compounds fast
export const DEFAULT_MIN_FOV_CHANGE = 0.0001 as Radians;

/**
 * Validates if a value is a valid FOV (field of view) in radians.
 * Valid FOV must be between 1° and 179°.
 */
export const isValidFov = (fov: unknown): fov is Radians => {
  return (
    typeof fov === "number" && fov >= DEFAULT_MIN_FOV && fov <= DEFAULT_MAX_FOV
  );
};

/**
 * Clamps FOV to valid range [1°, 179°]
 */
export const clampToValidFov = (fov: Radians): Radians => {
  return clamp(fov, DEFAULT_MIN_FOV, DEFAULT_MAX_FOV) as Radians;
};

/**
 * Compute next FOV value for animation interpolation.
 *
 * Animation-specific utility - uses geometric scaling for smooth FOV transitions.
 *
 * @param current - Current FOV value
 * @param steps - Number of steps to interpolate
 * @param min - Minimum FOV bound
 * @param max - Maximum FOV bound
 * @param stepFraction - Fraction per step (0-1 range)
 * @returns Next FOV value, clamped to valid range
 */
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

  // Inline geometric scaling: target = current * (1 + stepFraction)^steps
  const factor = Math.pow(1 + stepFraction, steps);
  const target = (current * factor) as Radians;

  return clampToValidFov(target);
};
