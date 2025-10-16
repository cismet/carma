import { Cartesian3 } from "cesium";
import type { Radians } from "@carma/units/types";
import {
  zeroToTwoPi,
  PI_OVER_FOUR,
  PI_OVER_TWO,
  TWO_PI,
} from "@carma/units/helpers";
import {
  CardinalDirectionClockwise,
  CardinalDirectionCounterClockwise,
  CardinalDirectionNames,
  CardinalDirectionLetters,
} from "@carma/geo/types";

const THREE_PI_OVER_TWO = (3 * Math.PI) / 2;

// Re-export with backward-compatible names
export {
  CardinalDirectionClockwise as CardinalDirectionEnum,
  CardinalDirectionCounterClockwise as InvertedCardinalDirectionEnum,
  CardinalDirectionNames as CardinalNames,
  CardinalDirectionLetters as CardinalLetters,
};

// Type alias for use within this file
type CardinalDirectionEnum = CardinalDirectionClockwise;

// for parser from provided GeoJSON File format.

const CARDINAL_STRINGS = Object.freeze({
  North: "NORD",
  East: "OST",
  South: "SUED",
  West: "WEST",
});

/**
 *
 * @param heading Heading in radians, North is 0
 * @returns Sector
 */
export function getCardinalDirectionFromHeading(
  heading: number
): CardinalDirectionEnum {
  return (
    Math.floor(zeroToTwoPi((heading + PI_OVER_FOUR) as Radians) / PI_OVER_TWO) %
    4
  );
}

export function getHeadingFromCardinalDirection(
  direction: CardinalDirectionEnum
): Radians {
  return zeroToTwoPi((direction * PI_OVER_TWO) as Radians);
}

export function getCardinalDirectionByLineAndCameraId(
  flightLine: number,
  cameraId: string,
  directionConfig: Record<string, Record<string, CardinalDirectionEnum>>
): CardinalDirectionEnum {
  const direction = directionConfig[flightLine % 2 === 1 ? "ODD" : "EVEN"];
  return direction[cameraId];
}

export function getApproximateHeadingBySector(
  sector: CardinalDirectionEnum,
  offset: number
): number {
  const baseHeading = getHeadingFromCardinalDirection(sector);
  return baseHeading + offset;
}

export const getCardinalDirection = (value: string): CardinalDirectionEnum => {
  if (!value) return CardinalDirectionClockwise.North;

  const normalized = value.trim().toUpperCase();

  if (normalized === CARDINAL_STRINGS.North)
    return CardinalDirectionClockwise.North;
  if (normalized === CARDINAL_STRINGS.East)
    return CardinalDirectionClockwise.East;
  if (normalized === CARDINAL_STRINGS.South)
    return CardinalDirectionClockwise.South;
  if (normalized === CARDINAL_STRINGS.West)
    return CardinalDirectionClockwise.West;

  return CardinalDirectionClockwise.North;
};

export const getDirectionFromCartesian = (
  position: Cartesian3,
  target: Cartesian3
): Cartesian3 => {
  const direction = Cartesian3.normalize(
    Cartesian3.subtract(target, position, new Cartesian3()),
    new Cartesian3()
  );
  return direction;
};

export const findClosestCardinalIndex = (
  heading: number,
  cardinals: number[]
) => {
  const normalizedHeading = zeroToTwoPi(heading as Radians);

  let closestIndex = 0;
  let minDifference = Number.MAX_VALUE;

  cardinals.forEach((cardinal, index) => {
    let diff = Math.abs(normalizedHeading - cardinal);
    if (diff > Math.PI) {
      diff = TWO_PI - diff;
    }

    if (diff < minDifference) {
      minDifference = diff;
      closestIndex = index;
    }
  });
  return closestIndex;
};

export const getCardinalHeadings = (headingOffset: number) => {
  // Base cardinal directions in radians
  const directions = [
    0, // North
    PI_OVER_TWO, // East
    Math.PI, // South
    THREE_PI_OVER_TWO, // West
  ];

  // Apply the heading offset to all directions
  return directions.map((heading) =>
    zeroToTwoPi((heading + headingOffset) as Radians)
  );
};
