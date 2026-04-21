import type { CesiumGeographicCoordinate } from "../store";

export const areCoordinatesEqual = (
  left: CesiumGeographicCoordinate | null | undefined,
  right: CesiumGeographicCoordinate | null | undefined
) =>
  left === right ||
  (left !== null &&
    left !== undefined &&
    right !== null &&
    right !== undefined &&
    left.latitude === right.latitude &&
    left.longitude === right.longitude &&
    left.altitude === right.altitude);

export const areCoordinateListsEqual = (
  left: readonly CesiumGeographicCoordinate[],
  right: readonly CesiumGeographicCoordinate[]
) =>
  left.length === right.length &&
  left.every((coordinate, index) => areCoordinatesEqual(coordinate, right[index]));
