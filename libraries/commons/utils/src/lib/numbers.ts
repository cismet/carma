import { clamp as clampRange } from "@carma-commons/math";

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
  if (typeof min === "number" && typeof max === "number") {
    return clampRange(v, min, max);
  }
  if (typeof min === "number") return Math.max(min, v);
  if (typeof max === "number") return Math.min(max, v);
  return v;
};

/**
 * @param a - first number
 * @param b - second number
 * @param epsilon - tolerance
 * @returns true if the numbers are within the tolerance
 */
export const isClose = (a: number, b: number, epsilon: number): boolean =>
  Math.abs(a - b) <= epsilon;

export const formatFixedNumber = (
  value: number | undefined,
  fixedDigits: number,
  options: {
    trimTrailingZeros?: boolean;
  } = {}
): string | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const fixedValue = value.toFixed(fixedDigits);
  return options.trimTrailingZeros === false
    ? fixedValue
    : parseFloat(fixedValue).toString();
};
