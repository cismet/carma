import { negativePiToPi } from "./negative-pi-to-pi";

/**
 * Calculate the shortest angular distance between two angles, accounting for wraparound.
 * Result is in range [-π, π] representing the direction and magnitude of rotation.
 * Unitless version - use wrapper from @carma/units/helpers for typed Radians
 *
 * @param from - Starting angle in radians (unitless)
 * @param to - Target angle in radians (unitless)
 * @returns Shortest angular distance in radians (unitless)
 *
 * @example
 * shortestAngleDelta(0, Math.PI / 2) // Math.PI / 2 (90° rotation)
 * shortestAngleDelta(Math.PI, -Math.PI) // 0 (same angle)
 * shortestAngleDelta(-Math.PI + 0.1, Math.PI - 0.1) // -0.2 (shorter to go backwards)
 */
export function shortestAngleDelta(from: number, to: number): number {
  return negativePiToPi(to - from);
}
