import { isFiniteNumber } from "@carma-commons/math";

/** The value when it is a finite number, else the fallback. */
export const finiteOr = (
  value: number | null | undefined,
  fallback: number
): number => (isFiniteNumber(value) ? value : fallback);

/** The value when it is finite, floored at zero, else the fallback floored at zero. */
export const nonNegativeFiniteOr = (
  value: number | null | undefined,
  fallback: number
): number => Math.max(0, finiteOr(value, fallback));
