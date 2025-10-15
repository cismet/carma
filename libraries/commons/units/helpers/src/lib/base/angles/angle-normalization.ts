import type { Radians, Degrees } from "@carma/units/types";
import { TWO_PI } from "./pi";

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

/**
 * Normalizes an angle in degrees to the range [-180, 180).
 *
 * This function takes an angle in degrees and returns an equivalent angle
 * in the range [-180, 180). This is useful for longitude normalization.
 *
 * @param angle - The angle in degrees to normalize
 * @returns The normalized angle in the range [-180, 180)
 *
 * @example
 * ```typescript
 * negativeOneEightyToOneEighty(0 as Degrees) // 0
 * negativeOneEightyToOneEighty(180 as Degrees) // 180
 * negativeOneEightyToOneEighty(190 as Degrees) // -170
 * negativeOneEightyToOneEighty(-190 as Degrees) // 170
 * negativeOneEightyToOneEighty(360 as Degrees) // 0
 * ```
 */
export function negativeOneEightyToOneEighty(angle: Degrees): Degrees {
  let normalized = angle % 360;
  if (normalized > 180) {
    return (normalized - 360) as Degrees;
  }
  if (normalized < -180) {
    return (normalized + 360) as Degrees;
  }
  return normalized as Degrees;
}
