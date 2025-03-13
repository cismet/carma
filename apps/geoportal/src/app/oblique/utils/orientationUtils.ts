import { Math as CesiumMath } from "cesium";

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

const isOddFlightLine = (flightLine: string): boolean => {
  return parseInt(flightLine) % 2 !== 0;
};

export function getCardinalDirectionByLineAndCameraId(
  flightLine: string,
  cameraId: string,
  directionConfig: Record<string, Record<string, CardinalDirectionEnum>>
): CardinalDirectionEnum {
  const direction =
    directionConfig[isOddFlightLine(flightLine) ? "ODD" : "EVEN"];
  return direction[cameraId];
}

export function getApproximateHeadingBySector(
  sector: CardinalDirectionEnum,
  offset: number
): number {
  const baseHeading = getHeadingFromCardinalDirection(sector);
  return baseHeading + offset;
}
