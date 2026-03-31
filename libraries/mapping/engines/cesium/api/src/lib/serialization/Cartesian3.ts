import { isFiniteNumber } from "@carma/math";
import type { Meters } from "@carma/units/types";

import { Cartesian3 } from "../cesium";
/**
 * Serializable object representation of Cartesian3.
 */
export interface Cartesian3Json {
  x: number;
  y: number;
  z: number;
}

/**
 * Array of XYZ values for Cartesian3 constructor.
 */
export type Cartesian3ConstructorArgs = [x: Meters, y: Meters, z: Meters];

/**
 * Convert Cesium Cartesian3 to JSON object for serialization.
 */
export const cartesian3ToJson = (cartesian3: Cartesian3): Cartesian3Json => ({
  x: cartesian3.x,
  y: cartesian3.y,
  z: cartesian3.z,
});

/**
 * Convert JSON object to Cesium Cartesian3.
 */
export const cartesian3FromJson = ({ x, y, z }: Cartesian3Json): Cartesian3 =>
  new Cartesian3(x, y, z);

export const isCartesian3Json = (
  value: Cartesian3Json | undefined | null
): value is Cartesian3Json =>
  !!value &&
  isFiniteNumber(value.x) &&
  isFiniteNumber(value.y) &&
  isFiniteNumber(value.z);
