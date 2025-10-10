// eslint-disable-next-line import/named
import { radToDeg, zeroToTwoPi } from "@carma-commons/math";
import { Radians } from "@carma/types";

export const formatHeadingDegrees = (headingRadians: number): Radians => {
  const normalized = zeroToTwoPi(headingRadians as Radians);
  const degrees = radToDeg(normalized);
  return Math.round(degrees);
};
