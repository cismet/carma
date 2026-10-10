import {
  CardinalDirectionClockwise,
  CardinalDirectionLetters,
} from "@carma-geo/data-structures";

import { zeroToTwoPi, PI, PI_OVER_TWO, PI_OVER_FOUR } from "@carma-units";
import type { Radians } from "@carma-units";
import type { CardinalDirection } from "../types";

/**
 * Headings are radians, north is 0 and they run clockwise, the way a compass
 * reads and the way MapLibre's bearing counts once converted to degrees.
 */

export const CardinalDirectionEnum = CardinalDirectionClockwise;

/** the four sectors in clockwise order, for stepping and slot mapping */
export const CARDINALS_CLOCKWISE: readonly CardinalDirection[] = [
  CardinalDirectionClockwise.North,
  CardinalDirectionClockwise.East,
  CardinalDirectionClockwise.South,
  CardinalDirectionClockwise.West,
];

/** "N", "O", "S", "W" */
export const cardinalLetter = (direction: CardinalDirection): string =>
  CardinalDirectionLetters.DE.get(direction) ?? "";

/** the sector a heading falls in, each 90° wide and centred on its cardinal */
export const getCardinalDirectionFromHeading = (
  heading: number
): CardinalDirection =>
  (Math.floor(zeroToTwoPi((heading + PI_OVER_FOUR) as Radians) / PI_OVER_TWO) %
    4) as CardinalDirection;

export const getHeadingFromCardinalDirection = (
  direction: CardinalDirection
): number => zeroToTwoPi((direction * PI_OVER_TWO) as Radians);

/**
 * Which way a camera looked on a given flight line. The cameras point along
 * and across the aircraft, so a line flown the other way swaps every sector.
 */
export const getCardinalDirectionByLineAndCameraId = (
  flightLine: number | undefined,
  cameraId: string,
  directionConfig: {
    EVEN: Record<string, CardinalDirection>;
    ODD: Record<string, CardinalDirection>;
  }
): CardinalDirection => {
  const direction =
    directionConfig[(flightLine ?? 0) % 2 === 1 ? "ODD" : "EVEN"];
  return direction[cameraId];
};

/** the strip heading of a sector: its cardinal plus the flight's rotation */
export const getApproximateHeadingBySector = (
  sector: CardinalDirection,
  offset: number
): number => getHeadingFromCardinalDirection(sector) + offset;

const CARDINAL_STRINGS: Record<string, CardinalDirection> = {
  NORD: CardinalDirectionClockwise.North,
  OST: CardinalDirectionClockwise.East,
  SUED: CardinalDirectionClockwise.South,
  WEST: CardinalDirectionClockwise.West,
};

/** the `ORI` property of a footprint feature */
export const getCardinalDirection = (value: unknown): CardinalDirection => {
  if (typeof value !== "string" || !value) {
    return CardinalDirectionClockwise.North;
  }
  return (
    CARDINAL_STRINGS[value.trim().toUpperCase()] ??
    CardinalDirectionClockwise.North
  );
};

/** the index of the heading closest to `heading`, around the circle */
export const findClosestCardinalIndex = (
  heading: number,
  cardinals: readonly number[]
): CardinalDirection => {
  const normalizedHeading = zeroToTwoPi(heading as Radians);
  let closestIndex = 0;
  let minDifference = Number.MAX_VALUE;
  cardinals.forEach((cardinal, index) => {
    let diff = Math.abs(normalizedHeading - cardinal);
    if (diff > PI) {
      diff = PI * 2 - diff;
    }
    if (diff < minDifference) {
      minDifference = diff;
      closestIndex = index;
    }
  });
  return closestIndex as CardinalDirection;
};

/** the four strip headings, indexed by sector */
export const getCardinalHeadings = (headingOffset: number): number[] =>
  CARDINALS_CLOCKWISE.map((direction) =>
    zeroToTwoPi(
      (getHeadingFromCardinalDirection(direction) + headingOffset) as Radians
    )
  );

/**
 * The next sector when turning. Clockwise on the compass is a smaller camera
 * index the other way round: looking north and turning right shows the west
 * facades, which the west sector holds.
 */
export const rotateCardinal = (
  direction: CardinalDirection,
  clockwise: boolean
): CardinalDirection =>
  ((direction + (clockwise ? 3 : 1)) % 4) as CardinalDirection;

/**
 * The sectors as they sit on screen with `active` on top: the arrows for
 * the siblings are heading-relative, so "up" is the sector ahead.
 */
export const headingRelativeSlots = (active: CardinalDirection) => {
  const topIdx = CARDINALS_CLOCKWISE.indexOf(active);
  return {
    topDir: active,
    rightDir: CARDINALS_CLOCKWISE[(topIdx + 1) % 4],
    bottomDir: CARDINALS_CLOCKWISE[(topIdx + 2) % 4],
    leftDir: CARDINALS_CLOCKWISE[(topIdx + 3) % 4],
  };
};
