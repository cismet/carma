// String-based cardinal directions (for config/serialization)
export const CardinalDirections = {
  North: "N",
  East: "E",
  South: "S",
  West: "W",
} as const;

export type CardinalDirection =
  (typeof CardinalDirections)[keyof typeof CardinalDirections];

// Ordinal-based cardinal directions (for indexing/rotation)
// Clockwise from North: North=0, East=1, South=2, West=3
export enum CardinalDirectionClockwise {
  North = 0,
  East = 1,
  South = 2,
  West = 3,
}

// Counter-clockwise from North: North=0, West=1, South=2, East=3
export enum CardinalDirectionCounterClockwise {
  North = 0,
  West = 1,
  South = 2,
  East = 3,
}

// Localized names
export const CardinalDirectionNames = Object.freeze({
  DE: new Map([
    [CardinalDirectionClockwise.North, "Norden"],
    [CardinalDirectionClockwise.East, "Osten"],
    [CardinalDirectionClockwise.South, "Süden"],
    [CardinalDirectionClockwise.West, "Westen"],
  ]),
  EN: new Map([
    [CardinalDirectionClockwise.North, "North"],
    [CardinalDirectionClockwise.East, "East"],
    [CardinalDirectionClockwise.South, "South"],
    [CardinalDirectionClockwise.West, "West"],
  ]),
});

// Localized single-letter abbreviations
export const CardinalDirectionLetters = Object.freeze({
  DE: new Map([
    [CardinalDirectionClockwise.North, "N"],
    [CardinalDirectionClockwise.East, "O"],
    [CardinalDirectionClockwise.South, "S"],
    [CardinalDirectionClockwise.West, "W"],
  ]),
  EN: new Map([
    [CardinalDirectionClockwise.North, "N"],
    [CardinalDirectionClockwise.East, "E"],
    [CardinalDirectionClockwise.South, "S"],
    [CardinalDirectionClockwise.West, "W"],
  ]),
});
