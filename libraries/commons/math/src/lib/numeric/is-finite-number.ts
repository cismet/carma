/**
 * Type guard: value is a finite number (not NaN, not ±Infinity, not non-number).
 */
export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
