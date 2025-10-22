import type { Cartesian2 } from "cesium";
import type { Meters } from "@carma/units/types";

/**
 * 2D Cartesian coordinate with x and y properties
 */
export type Cartesian2Primitive = Pick<Cartesian2, "x" | "y">;

/**
 * Cartesian2 constructor arguments: [x, y]
 * @remarks Cartesian coordinates in meters
 */
export type Cartesian2Constructor = [Meters, Meters];
