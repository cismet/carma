import type { Feature, Position } from "geojson";

/**
 * terra-draw's default `coordinatePrecision`: it rejects features with more
 * decimals ("Feature has coordinates with excessive precision"). 9 decimals
 * are sub-millimetre; raw vector-tile snap targets carry up to 15.
 */
const COORDINATE_PRECISION_FACTOR = 1e9;

const roundNumber = (n: number) =>
  Math.round(n * COORDINATE_PRECISION_FACTOR) / COORDINATE_PRECISION_FACTOR;

export const roundPosition = (position: Position): Position =>
  position.map(roundNumber);

const roundCoordinates = (coordinates: unknown): unknown =>
  typeof coordinates === "number"
    ? roundNumber(coordinates)
    : Array.isArray(coordinates)
    ? coordinates.map(roundCoordinates)
    : coordinates;

/** The feature with its coordinates rounded so terra-draw takes it back. */
export const roundFeatureCoordinates = (feature: Feature): Feature =>
  feature.geometry && "coordinates" in feature.geometry
    ? ({
        ...feature,
        geometry: {
          ...feature.geometry,
          coordinates: roundCoordinates(feature.geometry.coordinates),
        },
      } as Feature)
    : feature;
