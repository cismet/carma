/**
 * Linear interpolation between two values
 *
 * @param start - Starting value
 * @param end - Ending value
 * @param t - Interpolation factor (0 = start, 1 = end)
 * @returns Interpolated value
 *
 * @example
 * lerp(0, 100, 0.5) // 50
 * lerp(10, 20, 0.25) // 12.5
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * Clamp a value between min and max
 *
 * @param value - Value to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped value
 *
 * @example
 * clamp(150, 0, 100) // 100
 * clamp(-10, 0, 100) // 0
 * clamp(50, 0, 100) // 50
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Normalize an angle to the range [-π, π]
 *
 * @param angle - Angle in radians
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
 * Linear interpolation for angles (handles wrapping)
 *
 * @param start - Starting angle in radians
 * @param end - Ending angle in radians
 * @param t - Interpolation factor (0 = start, 1 = end)
 * @returns Interpolated angle
 *
 * @example
 * // Interpolate from 0 to π
 * lerpAngle(0, Math.PI, 0.5) // Math.PI / 2
 */
export function lerpAngle(start: number, end: number, t: number): number {
  const delta = negativePiToPi(end - start);
  return start + delta * t;
}
