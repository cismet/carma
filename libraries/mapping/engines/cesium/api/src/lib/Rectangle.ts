import { Rectangle } from "cesium";
import type { Radians } from "@carma/units/types";
import type { BBox, Extent } from "@carma/geo/types";
import { radToDeg } from "@carma/units/helpers";

export { Rectangle };

// note this is in Radians!
export type RectangleJsonRaw = Pick<
  Rectangle,
  "west" | "south" | "east" | "north"
>;

// see also @carma/geo/types Extent.rad

export type RectangleJson = Extent.rad;

export type RectangleConstructorArgs = [
  west: Radians,
  south: Radians,
  east: Radians,
  north: Radians
];

// recommended format for User facing configs outside cesium: Geojson/Turf BBox

/**
 * Convert a RectangleLike plain object to a Cesium Rectangle instance
 */

// geojson and turf suggested format for configs (Degrees)
export const rectangleFromBBox = ([
  west,
  south,
  east,
  north,
]: BBox): Rectangle => {
  return Rectangle.fromDegrees(west, south, east, north);
};

export const rectangleToBBox = (rect: Rectangle): BBox => {
  return [
    radToDeg(rect.west as Radians),
    radToDeg(rect.south as Radians),
    radToDeg(rect.east as Radians),
    radToDeg(rect.north as Radians),
  ];
};

/**
 * Convert a RectangleLike serializable object to a Cesium Rectangle instance (Radians!)
 */
export const rectangleFromJson = (
  rect: RectangleJson | RectangleJsonRaw
): Rectangle => {
  return new Rectangle(rect.west, rect.south, rect.east, rect.north);
};

/**
 * Convert a Cesium Rectangle to a plain RectangleLike object
 */
export const rectangleToJson = (rect: Rectangle): RectangleJson => {
  return {
    west: rect.west as Radians,
    south: rect.south as Radians,
    east: rect.east as Radians,
    north: rect.north as Radians,
  };
};
