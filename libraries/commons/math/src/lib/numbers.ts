import type { Ratio } from "@carma/types";

/**
 * @param v
 * @param referenceValue
 * @param tolerance
 * @returns corrected value [0] and a boolean [1] indicating if the value was clamped
 */

export const clampToToleranceRange = (
  v: number,
  referenceValue: number,
  tolerance: number
): [number, boolean] => {
  const min = referenceValue - tolerance;
  const max = referenceValue + tolerance;
  if (v < min) {
    return [min, true];
  } else if (v > max) {
    return [max, true];
  }
  return [v, false];
};

/** Clamp a number to [min,max] if provided.
 * @param v - value to clamp
 * @param min - minimum value (inclusive)
 * @param max - maximum value (inclusive)
 * @returns the clamped value
 */
export const clamp = (v: number, min?: number, max?: number): number => {
  let out = v;
  if (typeof min === "number") out = Math.max(min, out);
  if (typeof max === "number") out = Math.min(max, out);
  return out;
};

/**
 * @param a - first number
 * @param b - second number
 * @param epsilon - tolerance
 * @returns true if the numbers are within the tolerance
 */
export const isClose = (
  a: number,
  b: number,
  epsilon: number = Number.EPSILON
): boolean => Math.abs(a - b) <= epsilon;

/**
 * Compound scaling: base * (1 + stepFraction) ^ steps
 * steps may be negative (inverse / zoom out) or fractional (high‑resolution devices).
 * @param base - starting value
 * @param changePerStep - fractional change per step, e.g. 0.1 for +10% per step
 * @param steps - number of steps, may be negative or fractional
 * @returns the scaled value
 */
export const compoundScale = (
  base: number,
  changePerStep: Ratio,
  steps: number
): number => {
  if (
    !Number.isFinite(base) ||
    !Number.isFinite(changePerStep) ||
    !Number.isFinite(steps)
  ) {
    return base;
  }
  if (changePerStep === 0 || steps === 0) return base;
  return base * Math.pow(1 + changePerStep, steps);
};
