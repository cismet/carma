import { negativePiToPi } from "./negative-pi-to-pi";

/**
 * Linear interpolation for angles (handles wrapping)
 * Unitless version - use wrapper from @carma/units/helpers for typed Radians
 *
 * @param start - Starting angle in radians (unitless)
 * @param end - Ending angle in radians (unitless)
 * @param t - Interpolation factor (0 = start, 1 = end)
 * @returns Interpolated angle (unitless)
 *
 * @example
 * // Interpolate from 0 to π
 * lerpAngle(0, Math.PI, 0.5) // Math.PI / 2
 */
export function lerpAngle(start: number, end: number, t: number): number {
  const delta = negativePiToPi(end - start);
  return start + delta * t;
}
