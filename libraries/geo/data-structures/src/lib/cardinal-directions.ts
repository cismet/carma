export const CardinalDirections = {
  North: "N",
  East: "E",
  South: "S",
  West: "W",
} as const;

export type CardinalDirection =
  (typeof CardinalDirections)[keyof typeof CardinalDirections];

export enum CardinalDirectionClockwise {
  North = 0,
  East = 1,
  South = 2,
  West = 3,
}

export enum CardinalDirectionCounterClockwise {
  North = 0,
  West = 1,
  South = 2,
  East = 3,
}

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
