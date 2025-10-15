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
