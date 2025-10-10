import type { Radians } from "@carma/types";
import { TWO_PI } from "./constants";

/**
 * Normalizes an angle to the range [0, 2π).
 *
 * This function takes an angle in radians and returns an equivalent angle
 * in the range [0, 2π). Negative angles are wrapped to their positive equivalent,
 * and angles greater than 2π are wrapped to their modulo 2π equivalent.
 *
 * @param angle - The angle in radians to normalize
 * @returns The normalized angle in the range [0, 2π)
 *
 * @example
 * ```typescript
 * zeroToTwoPi(0 as Radians) // 0
 * zeroToTwoPi(Math.PI as Radians) // π
 * zeroToTwoPi(3 * Math.PI as Radians) // π
 * zeroToTwoPi(-Math.PI as Radians) // π
 * ```
 */
export function zeroToTwoPi(angle: Radians): Radians {
  if (angle >= 0 && angle < TWO_PI) {
    return angle;
  }
  const mod = angle % TWO_PI;
  if (mod < 0) {
    return (mod + TWO_PI) as Radians;
  }
  return mod as Radians;
}

/**
 * Normalizes an angle to the range [-π, π).
 *
 * This function takes an angle in radians and returns an equivalent angle
 * in the range [-π, π). This is useful for representing signed angular differences.
 *
 * @param angle - The angle in radians to normalize
 * @returns The normalized angle in the range [-π, π)
 *
 * @example
 * ```typescript
 * negativePiToPi(0 as Radians) // 0
 * negativePiToPi(Math.PI as Radians) // π
 * negativePiToPi(3 * Math.PI as Radians) // -π
 * negativePiToPi(-Math.PI as Radians) // -π
 * ```
 */
export function negativePiToPi(angle: Radians): Radians {
  const normalized = zeroToTwoPi(angle);
  if (normalized > Math.PI) {
    return (normalized - TWO_PI) as Radians;
  }
  return normalized;
}
