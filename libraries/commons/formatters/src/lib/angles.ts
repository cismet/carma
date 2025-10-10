import { radToDeg, zeroToTwoPi } from "@carma-commons/math";
import { Radians, Degrees } from "@carma/types";

export const formatHeadingDegrees = (headingRadians: number): Degrees => {
  const normalized = zeroToTwoPi(headingRadians as Radians);
  const degrees = radToDeg(normalized);
  return Math.round(degrees) as Degrees;
};
