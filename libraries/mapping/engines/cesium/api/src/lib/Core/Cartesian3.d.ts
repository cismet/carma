import type { Cartesian3 } from "cesium";
import type { Meters } from "@carma/units/types";

/**
 * 3D Cartesian coordinate with x, y, and z properties
 */
export type Cartesian3Primitive = Pick<Cartesian3, "x" | "y" | "z">;

/**
 * Cartesian3 constructor arguments: [x, y, z]
 * @remarks Cartesian coordinates in meters
 */
export type Cartesian3Constructor = [Meters, Meters, Meters];
