import { HeadingPitchRange } from "cesium";
import { Radians, Meters } from "@carma/units/types";

export const newHeadingPitchRange = (
  targetHeading: Radians,
  pitch: Radians,
  range: Meters
) => {
  return new HeadingPitchRange(targetHeading, pitch, range);
};
