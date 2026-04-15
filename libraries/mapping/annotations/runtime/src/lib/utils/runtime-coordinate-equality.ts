import type { RuntimeCoordinate } from "../store";

export const areRuntimeCoordinatesEqual = (
  left: RuntimeCoordinate | null | undefined,
  right: RuntimeCoordinate | null | undefined
) =>
  left === right ||
  (left !== null &&
    left !== undefined &&
    right !== null &&
    right !== undefined &&
    left.latitude === right.latitude &&
    left.longitude === right.longitude &&
    left.altitude === right.altitude);

export const areRuntimeCoordinateListsEqual = (
  left: readonly RuntimeCoordinate[],
  right: readonly RuntimeCoordinate[]
) =>
  left.length === right.length &&
  left.every((coordinate, index) =>
    areRuntimeCoordinatesEqual(coordinate, right[index])
  );
