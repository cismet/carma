/**
 * Trigonometric and angle manipulation functions
 * All functions work with unitless numbers (assumed to be radians)
 * Use wrappers from @carma/units/helpers for typed Radians
 */

/**
 * Normalize an angle to the range [-π, π]
 *
 * @param angle - Angle in radians (unitless)
 * @returns Normalized angle in range [-π, π]
 *
 * @example
 * negativePiToPi(3 * Math.PI) // -Math.PI
 * negativePiToPi(Math.PI / 2) // Math.PI / 2
 */
export function negativePiToPi(angle: number): number {
  const TWO_PI = Math.PI * 2;
  // Normalize to [0, 2π]
  let normalized = angle % TWO_PI;

  // Shift to [-π, π]
  if (normalized > Math.PI) {
    normalized -= TWO_PI;
  } else if (normalized < -Math.PI) {
    normalized += TWO_PI;
  }

  return normalized;
}

/**
 * Calculate the shortest angular distance between two angles, accounting for wraparound.
 * Result is in range [-π, π] representing the direction and magnitude of rotation.
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

/**
 * Linear interpolation for angles (handles wrapping)
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
