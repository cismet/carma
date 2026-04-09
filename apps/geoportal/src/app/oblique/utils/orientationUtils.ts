import { Cartesian3, Math as CesiumMath } from "cesium";
import {
  CardinalDirectionClockwise,
  CardinalDirectionLetters,
  CardinalDirectionNames,
} from "@carma-geo/data-structures";

// North is 0 and rotations are clockwise to the east

export const CardinalDirectionEnum = CardinalDirectionClockwise;
export type CardinalDirectionEnum =
  (typeof CardinalDirectionEnum)[keyof typeof CardinalDirectionEnum];

export const InvertedCardinalDirectionEnum = {
  North: CardinalDirectionEnum.South,
  East: CardinalDirectionEnum.West,
  South: CardinalDirectionEnum.North,
  West: CardinalDirectionEnum.East,
} as const;
export type InvertedCardinalDirectionEnum =
  (typeof InvertedCardinalDirectionEnum)[keyof typeof InvertedCardinalDirectionEnum];

export const CardinalNames = CardinalDirectionNames;
export const CardinalLetters = CardinalDirectionLetters;

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
  return (Math.floor(
    CesiumMath.zeroToTwoPi(heading + CesiumMath.PI_OVER_FOUR) /
      CesiumMath.PI_OVER_TWO
  ) % 4) as CardinalDirectionEnum;
}

export function getHeadingFromCardinalDirection(
  direction: CardinalDirectionEnum
): number {
  return CesiumMath.zeroToTwoPi(direction * CesiumMath.PI_OVER_TWO);
}

export function getCardinalDirectionByLineAndCameraId(
  flightLine: number,
  cameraId: string,
  directionConfig: Record<string, Record<string, CardinalDirectionEnum>>
): CardinalDirectionEnum {
  const direction = directionConfig[flightLine % 2 === 1 ? "ODD" : "EVEN"];
  return direction[cameraId] as CardinalDirectionEnum;
}

export function getApproximateHeadingBySector(
  sector: CardinalDirectionEnum,
  offset: number
): number {
  const baseHeading = getHeadingFromCardinalDirection(sector);
  return baseHeading + offset;
}

export const getCardinalDirection = (value: string): CardinalDirectionEnum => {
  if (!value) return CardinalDirectionEnum.North;

  const normalized = value.trim().toUpperCase();

  if (normalized === CARDINAL_STRINGS.North) return CardinalDirectionEnum.North;
  if (normalized === CARDINAL_STRINGS.East) return CardinalDirectionEnum.East;
  if (normalized === CARDINAL_STRINGS.South) return CardinalDirectionEnum.South;
  if (normalized === CARDINAL_STRINGS.West) return CardinalDirectionEnum.West;

  return CardinalDirectionEnum.North;
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
): CardinalDirectionEnum => {
  const normalizedHeading = CesiumMath.zeroToTwoPi(heading);

  let closestIndex = 0;
  let minDifference = Number.MAX_VALUE;

  cardinals.forEach((cardinal, index) => {
    let diff = Math.abs(normalizedHeading - cardinal);
    if (diff > Math.PI) {
      diff = CesiumMath.TWO_PI - diff;
    }

    if (diff < minDifference) {
      minDifference = diff;
      closestIndex = index;
    }
  });
  return closestIndex as CardinalDirectionEnum;
};

export const getCardinalHeadings = (headingOffset: number) => {
  // Base cardinal directions in radians
  const directions = [
    0, // North
    CesiumMath.PI_OVER_TWO, // East
    CesiumMath.PI, // South
    CesiumMath.THREE_PI_OVER_TWO, // West
  ];

  // Apply the heading offset to all directions
  return directions.map((heading) =>
    CesiumMath.zeroToTwoPi(heading + headingOffset)
  );
};
