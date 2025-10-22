import type { HeadingPitchRange } from "cesium";
import type { Radians, Meters } from "@carma/units/types";

/**
 * Camera orientation relative to a target point
 * @remarks heading and pitch are in radians, range is distance in meters
 */
export type HeadingPitchRangePrimitive = Pick<
  HeadingPitchRange,
  "heading" | "pitch" | "range"
>;

/**
 * HeadingPitchRange constructor arguments: [heading, pitch, range]
 * @remarks heading and pitch are in radians, range is distance in meters
 */
export type HeadingPitchRangeConstructor = [Radians, Radians, Meters];
