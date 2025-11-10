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
