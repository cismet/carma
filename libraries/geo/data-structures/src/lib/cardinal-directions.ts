export const CardinalDirections = {
  North: "N",
  East: "E",
  South: "S",
  West: "W",
} as const;

export type CardinalDirection =
  (typeof CardinalDirections)[keyof typeof CardinalDirections];

export const CardinalDirectionClockwise = {
  North: 0,
  East: 1,
  South: 2,
  West: 3,
} as const;
export type CardinalDirectionClockwise =
  (typeof CardinalDirectionClockwise)[keyof typeof CardinalDirectionClockwise];

export const CardinalDirectionCounterClockwise = {
  North: 0,
  West: 1,
  South: 2,
  East: 3,
} as const;
export type CardinalDirectionCounterClockwise =
  (typeof CardinalDirectionCounterClockwise)[keyof typeof CardinalDirectionCounterClockwise];

export const CardinalDirectionNames = Object.freeze({
  DE: new Map<CardinalDirectionClockwise, string>([
    [CardinalDirectionClockwise.North, "Norden"],
    [CardinalDirectionClockwise.East, "Osten"],
    [CardinalDirectionClockwise.South, "Süden"],
    [CardinalDirectionClockwise.West, "Westen"],
  ]),
  EN: new Map<CardinalDirectionClockwise, string>([
    [CardinalDirectionClockwise.North, "North"],
    [CardinalDirectionClockwise.East, "East"],
    [CardinalDirectionClockwise.South, "South"],
    [CardinalDirectionClockwise.West, "West"],
  ]),
});

export const CardinalDirectionLetters = Object.freeze({
  DE: new Map<CardinalDirectionClockwise, string>([
    [CardinalDirectionClockwise.North, "N"],
    [CardinalDirectionClockwise.East, "O"],
    [CardinalDirectionClockwise.South, "S"],
    [CardinalDirectionClockwise.West, "W"],
  ]),
  EN: new Map<CardinalDirectionClockwise, string>([
    [CardinalDirectionClockwise.North, "N"],
    [CardinalDirectionClockwise.East, "E"],
    [CardinalDirectionClockwise.South, "S"],
    [CardinalDirectionClockwise.West, "W"],
  ]),
});

export const CardinalHeadingsQuadrants = [
  CardinalDirectionClockwise.North,
  CardinalDirectionClockwise.East,
  CardinalDirectionClockwise.South,
  CardinalDirectionClockwise.West,
] as const;
