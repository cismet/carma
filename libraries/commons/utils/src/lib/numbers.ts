/**
 *
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
