import { Cartesian3, Cartographic } from "cesium";
import type { LatLngAlt } from "@carma/geo/types";
import type { Meters } from "@carma/units/types";
import { getDegreesFromCartographic } from "./Cartographic";

export { Cartesian3 };

/**
 * Serializable object representation of Cartesian3
 */
export interface Cartesian3Json {
  x: number;
  y: number;
  z: number;
}

/**
 * Array of XYZ values for Cartesian3 constructor
 */
export type Cartesian3ConstructorArgs = [x: Meters, y: Meters, z: Meters];

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
 * Convert Cesium Cartesian3 to JSON object for serialization
 */
export const cartesian3ToJson = (cartesian3: Cartesian3): Cartesian3Json => {
  return { x: cartesian3.x, y: cartesian3.y, z: cartesian3.z };
};

/**
 * Convert JSON object to Cesium Cartesian3
 */
export const cartesian3FromJson = ({ x, y, z }: Cartesian3Json): Cartesian3 => {
  return new Cartesian3(x, y, z);
};
