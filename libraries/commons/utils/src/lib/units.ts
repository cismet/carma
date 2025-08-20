import type { Degrees, Radians, Meters } from "@carma-commons/types";
import { DEG_TO_RAD_FACTOR, RAD_TO_DEG_FACTOR } from "./constants";

// Branding helpers
export const asDegrees = (n: number): Degrees => n as Degrees;
export const asRadians = (n: number): Radians => n as Radians;
export const asMeters = (n: number): Meters => n as Meters;

// Conversions (branded)
// allow forwarding undefined values in variables with overloads
// units.ts
export function degToRad(deg: Degrees): Radians;
// pass-through undefined
export function degToRad(deg: undefined): undefined;
// union overload for callers with Degrees | undefined
export function degToRad(deg: Degrees | undefined): Radians | undefined;
// single implementation compatible with all overloads
export function degToRad(deg: Degrees | undefined): Radians | undefined {
  return deg === undefined ? undefined : asRadians(deg * DEG_TO_RAD_FACTOR);
}

export function radToDeg(rad: Radians): Degrees;
export function radToDeg(rad: undefined): undefined;
export function radToDeg(rad: Radians | undefined): Degrees | undefined;
export function radToDeg(rad: Radians | undefined): Degrees | undefined {
  return rad === undefined ? undefined : asDegrees(rad * RAD_TO_DEG_FACTOR);
}
