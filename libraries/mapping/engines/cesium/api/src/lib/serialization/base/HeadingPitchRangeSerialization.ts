import { HeadingPitchRange } from "../../cesium";
import type { Meters, Radians } from "@carma/units/types";

export type HeadingPitchRangeJsonRaw = Pick<
  HeadingPitchRange,
  "heading" | "pitch" | "range"
>;

export type HeadingPitchRangeJson = {
  heading: Radians;
  pitch: Radians;
  range: Meters;
};
