import type { Degrees, Radians } from "@carma/units/types";
import { PI } from "./pi";

// Conversion constants
const DEG_TO_RAD_FACTOR = PI / 180;
const RAD_TO_DEG_FACTOR = 180 / PI;

// Conversions (branded)
// allow forwarding undefined values in variables with overloads
export function degToRad(deg: Degrees): Radians;
// pass-through undefined
export function degToRad(deg: undefined): undefined;
// union overload for callers with Degrees | undefined
export function degToRad(deg: Degrees | undefined): Radians | undefined;
// single implementation compatible with all overloads
export function degToRad(deg: Degrees | undefined): Radians | undefined {
  return deg === undefined ? undefined : ((deg * DEG_TO_RAD_FACTOR) as Radians);
}

export function radToDeg(rad: Radians): Degrees;
export function radToDeg(rad: undefined): undefined;
export function radToDeg(rad: Radians | undefined): Degrees | undefined;
export function radToDeg(rad: Radians | undefined): Degrees | undefined {
  return rad === undefined ? undefined : ((rad * RAD_TO_DEG_FACTOR) as Degrees);
}

// Numeric conversions (non-branded)
// Use these for loops/maps converting many values from external APIs
// For single constants, prefer: degToRad(10 as Degrees) - self-documenting!

/**
 * Convert degrees (as number) to radians (as number)
 *
 * ⚠️ Use for bulk conversions (loops, maps) with external APIs
 * For constants, prefer: degToRad(value as Degrees)
 *
 * @example
 * // Good: Converting array of Cartographic coordinates
 * coords.map(c => radToDegNumeric(c.latitude))
 *
 * // Bad: Single constant (use degToRad(10 as Degrees) instead)
 * const threshold = degToRadNumeric(10);
 */
export function degToRadNumeric(deg: number): number;
export function degToRadNumeric(deg: undefined): undefined;
export function degToRadNumeric(deg: number | undefined): number | undefined;
export function degToRadNumeric(deg: number | undefined): number | undefined {
  return deg === undefined ? undefined : deg * DEG_TO_RAD_FACTOR;
}

/**
 * Convert radians (as number) to degrees (as number)
 *
 * ⚠️ Use for bulk conversions (loops, maps) with external APIs
 * For constants, prefer: radToDeg(value as Radians)
 *
 * @example
 * // Good: Converting array of Cartographic coordinates
 * coords.map(c => radToDegNumeric(c.latitude))
 *
 * // Bad: Single constant (use radToDeg(Math.PI as Radians) instead)
 * const deg = radToDegNumeric(Math.PI);
 */
export function radToDegNumeric(rad: number): number;
export function radToDegNumeric(rad: undefined): undefined;
export function radToDegNumeric(rad: number | undefined): number | undefined;
export function radToDegNumeric(rad: number | undefined): number | undefined {
  return rad === undefined ? undefined : rad * RAD_TO_DEG_FACTOR;
}
