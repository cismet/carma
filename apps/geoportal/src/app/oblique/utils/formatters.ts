import { zeroToTwoPi, radToDegNumeric } from "@carma/units/helpers";
import type { Radians } from "@carma/units/types";

export const formatHeadingDegrees = (headingRadians: number): number => {
  const normalized = zeroToTwoPi(headingRadians as Radians);
  const degrees = radToDegNumeric(normalized);
  return Math.round(degrees);
};
