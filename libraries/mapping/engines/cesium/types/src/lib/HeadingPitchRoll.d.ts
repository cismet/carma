import type { HeadingPitchRoll } from "cesium";
import type { Radians } from "@carma/units/types";

/**
 * Camera orientation angles in radians
 * @remarks All values (heading, pitch, roll) are in radians
 */
export type HeadingPitchRollPrimitive = Pick<
  HeadingPitchRoll,
  "heading" | "pitch" | "roll"
>;

/**
 * HeadingPitchRoll constructor arguments: [heading, pitch, roll]
 * @remarks All values are in radians
 */
export type HeadingPitchRollConstructor = [Radians, Radians, Radians];
