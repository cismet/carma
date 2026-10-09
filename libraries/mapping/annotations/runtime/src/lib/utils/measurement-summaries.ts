import {
  ecefDistance,
  ecefFromGeographicCoordinate,
} from "@carma-mapping/annotations/core";

import type { AnnotationGeographicCoordinate } from "../store/annotations-store.types";
import { resolveBearingRadFromFirstToLastCoordinate } from "./resolve-bearing-rad-from-first-to-last-coordinate";

export type PolylineMeasurementSummary = {
  totalLengthMeters: number;
  segmentCount: number;
  meanSegmentLengthMeters: number;
  totalAbsoluteElevationChangeMeters: number;
  startEndElevationDeltaMeters: number;
  ascentMeters: number;
  descentMeters: number;
  bearingRad: number | null;
};

export const computePolylineSegmentLengthsMeters = (
  coordinates: readonly AnnotationGeographicCoordinate[]
): readonly number[] =>
  coordinates.flatMap((startCoordinate, index) => {
    const endCoordinate = coordinates[index + 1];
    if (!startCoordinate || !endCoordinate) {
      return [];
    }

    return [
      ecefDistance(
        ecefFromGeographicCoordinate(startCoordinate),
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

const computeClosedCoordinatePathLengthMeters = (
  coordinates: readonly AnnotationGeographicCoordinate[]
): number => {
  if (coordinates.length < 2) {
    return 0;
  }

  const pointsECEF = coordinates.map((coordinate) =>
    ecefFromGeographicCoordinate(coordinate)
  );
  let totalLengthMeters = 0;

  for (let index = 0; index < pointsECEF.length; index += 1) {
    const startPoint = pointsECEF[index];
    const endPoint = pointsECEF[(index + 1) % pointsECEF.length];
    if (!startPoint || !endPoint) {
      continue;
    }

    totalLengthMeters += ecefDistance(startPoint, endPoint);
  }

  return totalLengthMeters;
};

export const resolvePolylineMeasurementSummary = (
  coordinates: readonly AnnotationGeographicCoordinate[]
): PolylineMeasurementSummary | null => {
  if (coordinates.length < 2) {
    return null;
  }

  let ascentMeters = 0;
  let descentMeters = 0;

  coordinates.forEach((startCoordinate, index) => {
    const endCoordinate = coordinates[index + 1];
    if (!startCoordinate || !endCoordinate) {
      return;
    }

    const heightDeltaMeters = endCoordinate.altitude - startCoordinate.altitude;
    if (!Number.isFinite(heightDeltaMeters) || heightDeltaMeters === 0) {
      return;
    }

    if (heightDeltaMeters > 0) {
      ascentMeters += heightDeltaMeters;
      return;
    }

    descentMeters += Math.abs(heightDeltaMeters);
  });

  const segmentCount = coordinates.length - 1;
  if (segmentCount <= 0) {
    return null;
  }

  const totalLengthMeters = computePolylineTotalLengthMeters(coordinates);
  const startAltitudeMeters = coordinates[0]?.altitude ?? 0;
  const endAltitudeMeters = coordinates[coordinates.length - 1]?.altitude ?? 0;

  return {
    totalLengthMeters,
    segmentCount,
    meanSegmentLengthMeters: totalLengthMeters / segmentCount,
    totalAbsoluteElevationChangeMeters: ascentMeters + descentMeters,
    startEndElevationDeltaMeters: endAltitudeMeters - startAltitudeMeters,
    ascentMeters,
    descentMeters,
    bearingRad: resolveBearingRadFromFirstToLastCoordinate(coordinates),
  };
};
