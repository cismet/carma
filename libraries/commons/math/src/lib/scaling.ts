import type { Ratio } from "@carma/units/types";
/**
 * Geometric (compound growth) scaling: base * (1 + stepFraction) ^ steps
 * steps may be negative (inverse / zoom out) or fractional (high‑resolution devices).
 * supports @carma/units Ratio and unit preserving branded operations
 * @param base - starting value
 * @param changePerStep - fractional change per step, e.g. 0.1 for +10% per step
 * @param steps - number of steps, may be negative or fractional
 * @returns the scaled value
 */
export function geometricScale(
  base: number,
  changePerStep: number,
  steps: number
): number;
export function geometricScale<T extends number>(
  base: T,
  changePerStep: Ratio,
  steps: number
): T;
export function geometricScale<T extends number>(
  base: T,
  changePerStep: number,
  steps: number
): T {
  if (
    !Number.isFinite(base as number) ||
    !Number.isFinite(changePerStep) ||
    !Number.isFinite(steps)
  ) {
    return base;
  }
  if (changePerStep === 0 || steps === 0) return base;
  const scaled = (base as number) * Math.pow(1 + changePerStep, steps);
  return scaled as T;
}
