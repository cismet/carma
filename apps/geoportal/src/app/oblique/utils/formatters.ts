import { Math as CesiumMath } from "cesium";

export const formatHeadingDegrees = (headingRadians: number): number => {
  const degrees = CesiumMath.toDegrees(CesiumMath.zeroToTwoPi(headingRadians));
  return Math.round(degrees);
};
