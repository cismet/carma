import { ecefFromGeographicCoordinate } from "@carma-geo/proj";

import type { AnnotationGeographicCoordinate } from "../types/annotation-geographic-coordinate";

/** Straight ECEF distance of each consecutive pair, in metres. */
export const computePolylineSegmentLengthsMeters = (
  coordinates: readonly AnnotationGeographicCoordinate[]
): readonly number[] =>
  coordinates.flatMap((startCoordinate, index) => {
    const endCoordinate = coordinates[index + 1];
    if (!startCoordinate || !endCoordinate) {
      return [];
    }

    return [
      ecefFromGeographicCoordinate(startCoordinate).distanceTo(
        ecefFromGeographicCoordinate(endCoordinate)
      ),
    ];
  });

export const computePolylineTotalLengthMeters = (
  coordinates: readonly AnnotationGeographicCoordinate[]
): number =>
  computePolylineSegmentLengthsMeters(coordinates).reduce(
    (totalLengthMeters, segmentLengthMeters) =>
      totalLengthMeters + segmentLengthMeters,
    0
  );
