import type { Rectangle } from "cesium";
import type { Longitude, Latitude } from "@carma/geo/types";

/**
 * Geographic rectangle bounds in radians
 * @remarks west, south, east, north values are in radians
 */
export type RectanglePrimitive = Pick<
  Rectangle,
  "west" | "south" | "east" | "north"
>;

/**
 * Rectangle constructor arguments: [west, south, east, north]
 * @remarks All values are in radians
 */
export type RectangleConstructor = [
  Longitude.rad,
  Latitude.rad,
  Longitude.rad,
  Latitude.rad
];
