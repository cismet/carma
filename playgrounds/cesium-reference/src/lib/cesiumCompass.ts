export enum CardinalDirections {
  N = "N",
  S = "S",
  E = "E",
  W = "W",
}

export const getCardinalDirection = (
  headingDegrees: number
): CardinalDirections => {
  const directions = Object.values(CardinalDirections);
  const index = Math.floor(((headingDegrees + 45) % 360) / 90);
  const cardinalDirection = directions[index];
  return cardinalDirection as CardinalDirections;
};
