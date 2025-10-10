import type { Degrees, Radians } from "@carma/types";
import { DEG_TO_RAD_FACTOR, RAD_TO_DEG_FACTOR } from "./constants";

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
