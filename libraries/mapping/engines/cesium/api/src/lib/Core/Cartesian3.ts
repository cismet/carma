// Re-export Cartesian3 class from Cesium
import { Cartesian3 } from "cesium";
export { Cartesian3 };

export const isValidCartesian3 = (
  cartesian: unknown
): cartesian is Cartesian3 => cartesian instanceof Cartesian3;

/**
 * Calculate distance between two Cartesian3 points
 */
export const cartesian3Distance = (
  cartesian1: Cartesian3,
  cartesian2: Cartesian3
): number => {
  return Cartesian3.distance(cartesian1, cartesian2);
};
