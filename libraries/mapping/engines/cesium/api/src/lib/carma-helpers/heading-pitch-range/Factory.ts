import { HeadingPitchRange } from "../../cesium";
import type { Meters, Radians } from "@carma/units/types";

/**
 * Create a new HeadingPitchRange instance.
 */
export const newHeadingPitchRange = (
  targetHeading: Radians,
  pitch: Radians,
  range: Meters
): HeadingPitchRange => new HeadingPitchRange(targetHeading, pitch, range);
