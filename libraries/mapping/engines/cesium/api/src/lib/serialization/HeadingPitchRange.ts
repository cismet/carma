import type { Meters, Radians } from "@carma/units/types";

import { HeadingPitchRange } from "../cesium";
export type HeadingPitchRangeJsonRaw = Pick<
  HeadingPitchRange,
  "heading" | "pitch" | "range"
>;

export type HeadingPitchRangeJson = {
  heading: Radians;
  pitch: Radians;
  range: Meters;
};
