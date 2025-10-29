// Re-export Cartesian2 class from Cesium
import { Cartesian2 } from "cesium";
export { Cartesian2 };

export const isValidCartesian2 = (
  cartesian: unknown
): cartesian is Cartesian2 => cartesian instanceof Cartesian2;

/**
 * Create a new Cartesian2 instance
 */
export const newCartesian2 = (x: number, y: number): Cartesian2 => {
  return new Cartesian2(x, y);
};
