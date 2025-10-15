import { radToDeg, zeroToTwoPi } from "@carma/units/helpers";
import type { Radians, Degrees } from "@carma/units/types";

export const formatHeadingDegrees = (headingRadians: number): Degrees => {
  const normalized = zeroToTwoPi(headingRadians as Radians);
  const degrees = radToDeg(normalized);
  return Math.round(degrees) as Degrees;
};
