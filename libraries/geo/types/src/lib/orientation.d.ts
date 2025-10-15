import type { Degrees, Radians } from "@carma/units/types";

interface HeadingPitchRollDegrees {
  heading?: Degrees;
  pitch?: Degrees;
  roll?: Degrees;
}

interface HeadingPitchRollRadians {
  heading?: Radians;
  pitch?: Radians;
  roll?: Radians;
}

export namespace HeadingPitchRoll {
  export type deg = HeadingPitchRollDegrees;
  export type rad = HeadingPitchRollRadians;
}
