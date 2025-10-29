import { HeadingPitchRoll } from "cesium";
import type { Degrees, Radians } from "@carma/units/types";
export { HeadingPitchRoll };

type HeadingPitchRollPrimitiveNumbers = Pick<
  HeadingPitchRoll,
  "heading" | "pitch" | "roll"
>;

type HeadingPitchRollPrimitiveDegrees = {
  heading: Degrees;
  pitch: Degrees;
  roll: Degrees;
};

type HeadingPitchRollPrimitiveRadians = {
  heading: Radians;
  pitch: Radians;
  roll: Radians;
};

export namespace HeadingPitchRollPrimitive {
  export type num = HeadingPitchRollPrimitiveNumbers;
  export type deg = HeadingPitchRollPrimitiveDegrees;
  export type rad = HeadingPitchRollPrimitiveRadians;
}
