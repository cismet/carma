// Re-export Cartesian3 class from Cesium
import { Cartesian3, Cartographic } from "cesium";
import type { LatLngAlt } from "@carma/geo/types";
import { getDegreesFromCartographic } from "./Cartographic";
import { Meters } from "@carma/units/types";

export { Cartesian3 };

/**
 * Plain object representation of Cartesian3 for serialization
 */
export interface PlainCartesian3 {
  x: number;
  y: number;
  z: number;
}

export const isValidCartesian3 = (
  cartesian: unknown
): cartesian is Cartesian3 => cartesian instanceof Cartesian3;

/**
 * Convert Cesium Cartesian3 to degrees LatLngAlt
 */
export const getDegreesFromCartesian = (
  cartesian: Cartesian3
): LatLngAlt.deg => {
  const cartographic = Cartographic.fromCartesian(cartesian);
  return getDegreesFromCartographic(cartographic);
};

/**
 * Calculate distance between two Cartesian3 points
 */
export const cartesian3Distance = (
  cartesian1: Cartesian3,
  cartesian2: Cartesian3
): Meters => {
  return Cartesian3.distance(cartesian1, cartesian2) as Meters;
};

/**
 * Convert Cesium Cartesian3 to plain object for serialization
 */
export const toPlainCartesian3 = (cartesian3: Cartesian3): PlainCartesian3 => {
  return { x: cartesian3.x, y: cartesian3.y, z: cartesian3.z };
};

/**
 * Convert plain object to Cesium Cartesian3
 */
export const fromPlainCartesian3 = ({
  x,
  y,
  z,
}: PlainCartesian3): Cartesian3 => {
  return new Cartesian3(x, y, z);
};
