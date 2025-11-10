import { HeadingPitchRange } from "cesium";
export { HeadingPitchRange };
import { Radians, Meters } from "@carma/units/types";

export type HeadingPitchRangeJsonRaw = Pick<
  HeadingPitchRange,
  "heading" | "pitch" | "range"
>;

export type HeadingPitchRangeJson = {
  heading: Radians;
  pitch: Radians;
  range: Meters;
};

export const isValidHeadingPitchRange = (
  headingPitchRange: unknown
): headingPitchRange is HeadingPitchRange => {
  return headingPitchRange instanceof HeadingPitchRange;
};

/**
 * Create a new HeadingPitchRange instance
 */
export const newHeadingPitchRange = (
  targetHeading: Radians,
  pitch: Radians,
  range: Meters
): HeadingPitchRange => {
  return new HeadingPitchRange(targetHeading, pitch, range);
};
