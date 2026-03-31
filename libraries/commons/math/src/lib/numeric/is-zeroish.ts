import { isFiniteNumber } from "./is-finite-number";

/**
 * Returns true if value is not a finite number or is within epsilon of zero.
 */
export const isZeroish = (value: number | undefined, epsilon = 1e-9): boolean =>
  !isFiniteNumber(value) || Math.abs(value) <= epsilon;
