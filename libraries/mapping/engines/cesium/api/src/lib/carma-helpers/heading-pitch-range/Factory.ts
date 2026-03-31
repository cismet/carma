import type { Meters, Radians } from "@carma/units/types";

import { HeadingPitchRange } from "../../cesium";
/**
 * Create a new HeadingPitchRange instance.
 */
export const newHeadingPitchRange = (
  targetHeading: Radians,
  pitch: Radians,
  range: Meters
): HeadingPitchRange => new HeadingPitchRange(targetHeading, pitch, range);
