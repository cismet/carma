/**
 * Normalize an angle to the range [-π, π]
 * Unitless version - use wrapper from @carma/units/helpers for typed Radians
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
