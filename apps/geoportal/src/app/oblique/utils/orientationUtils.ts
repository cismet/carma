import { Cartesian3, Math as CesiumMath } from "cesium";

// North is 0 and rotations are clockwise to the east

export enum CardinalDirectionEnum {
  North = 0,
  East = 1,
  South = 2,
  West = 3,
}

export const CardinalNames = Object.freeze({
  DE: new Map([
    [CardinalDirectionEnum.North, "Norden"],
    [CardinalDirectionEnum.East, "Osten"],
    [CardinalDirectionEnum.South, "Süden"],
    [CardinalDirectionEnum.West, "Westen"],
  ]),
  EN: new Map([
    [CardinalDirectionEnum.North, "North"],
    [CardinalDirectionEnum.East, "East"],
    [CardinalDirectionEnum.South, "South"],
    [CardinalDirectionEnum.West, "West"],
  ]),
});

export const CardinalLetters = Object.freeze({
  DE: new Map([
    [CardinalDirectionEnum.North, "N"],
    [CardinalDirectionEnum.East, "O"],
    [CardinalDirectionEnum.South, "S"],
    [CardinalDirectionEnum.West, "W"],
  ]),
  EN: new Map([
    [CardinalDirectionEnum.North, "N"],
    [CardinalDirectionEnum.East, "E"],
    [CardinalDirectionEnum.South, "S"],
    [CardinalDirectionEnum.West, "W"],
  ]),
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
    Math.floor(
      CesiumMath.zeroToTwoPi(heading + CesiumMath.PI_OVER_FOUR) /
        CesiumMath.PI_OVER_TWO
    ) % 4
  );
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
  return direction[cameraId];
}

export function getApproximateHeadingBySector(
  sector: CardinalDirectionEnum,
  offset: number
): number {
  const baseHeading = getHeadingFromCardinalDirection(sector);
  return baseHeading + offset;
}

// for parser from provided GeoJSON File format.

const CARDINAL_STRINGS = Object.freeze({
  North: "NORD",
  East: "OST",
  South: "SUED",
  West: "WEST",
});

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
) => {
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
  return closestIndex;
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
