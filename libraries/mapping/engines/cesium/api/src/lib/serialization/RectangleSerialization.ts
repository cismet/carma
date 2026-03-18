import { radToDeg } from "@carma/units/helpers";
import type { BBox, Extent } from "@carma/geo/types";
import type { Radians } from "@carma/units/types";
import { Rectangle } from "../cesium";

// note this is in radians
export type RectangleJsonRaw = Pick<
  Rectangle,
  "west" | "south" | "east" | "north"
>;

export type RectangleJson = Extent.rad;

export type RectangleConstructorArgs = [
  west: Radians,
  south: Radians,
  east: Radians,
  north: Radians
];

export const rectangleFromBBox = ([
  west,
  south,
  east,
  north,
]: BBox): Rectangle => Rectangle.fromDegrees(west, south, east, north);

export const rectangleToBBox = (rect: Rectangle): BBox => [
  radToDeg(rect.west as Radians),
  radToDeg(rect.south as Radians),
  radToDeg(rect.east as Radians),
  radToDeg(rect.north as Radians),
];

export const rectangleFromJson = (
  rect: RectangleJson | RectangleJsonRaw
): Rectangle => new Rectangle(rect.west, rect.south, rect.east, rect.north);

export const rectangleToJson = (rect: Rectangle): RectangleJson => ({
  west: rect.west as Radians,
  south: rect.south as Radians,
  east: rect.east as Radians,
  north: rect.north as Radians,
});
