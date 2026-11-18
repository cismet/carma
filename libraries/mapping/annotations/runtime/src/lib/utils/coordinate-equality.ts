import type { AnnotationGeographicCoordinate } from "../store";

export const areCoordinatesEqual = (
  left: AnnotationGeographicCoordinate | null | undefined,
  right: AnnotationGeographicCoordinate | null | undefined
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
  left: readonly AnnotationGeographicCoordinate[],
  right: readonly AnnotationGeographicCoordinate[]
) =>
  left.length === right.length &&
  left.every((coordinate, index) =>
    areCoordinatesEqual(coordinate, right[index])
  );
