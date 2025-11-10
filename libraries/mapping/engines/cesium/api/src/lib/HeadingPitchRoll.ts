import { HeadingPitchRoll } from "cesium";
import type { Degrees, Radians } from "@carma/units/types";
export { HeadingPitchRoll };

export type HeadingPitchRollJsonRaw = Pick<
  HeadingPitchRoll,
  "heading" | "pitch" | "roll"
>;

export type HeadingPitchRollJson = {
  heading: Radians;
  pitch: Radians;
  roll: Radians;
};

export type HeadingPitchRollDegreesJson = {
  heading: Degrees;
  pitch: Degrees;
  roll: Degrees;
};

// partial type
export type HeadingPitchJson = {
  heading: Radians;
  pitch: Radians;
};
