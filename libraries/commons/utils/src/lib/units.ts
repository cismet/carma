import type { Degrees, Radians, Meters } from "@carma-commons/types";
import { DEG_TO_RAD, RAD_TO_DEG } from "./constants";

// Type guards (runtime can't detect brands on primitives; these narrow types only)
export const isDegrees = (v: unknown): v is Degrees => typeof v === "number";
export const isRadians = (v: unknown): v is Radians => typeof v === "number";
export const isMeters = (v: unknown): v is Meters => typeof v === "number";

// Branding helpers
export const asDegrees = (n: number): Degrees => n as Degrees;
export const asRadians = (n: number): Radians => n as Radians;
export const asMeters = (n: number): Meters => n as Meters;

// Conversions (branded)
export const degToRad = (deg: Degrees): Radians =>
  ((deg as number) * DEG_TO_RAD) as Radians;
export const radToDeg = (rad: Radians): Degrees =>
  ((rad as number) * RAD_TO_DEG) as Degrees;

// Unwrapping
export const unDeg = (deg: Degrees): number => deg as number;
export const unRad = (rad: Radians): number => rad as number;
export const unMeters = (m: Meters): number => m as number;
