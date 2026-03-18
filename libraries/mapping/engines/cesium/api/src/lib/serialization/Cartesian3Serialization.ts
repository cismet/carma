import { Cartesian3 } from "../cesium";
import type { Meters } from "@carma/units/types";

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
