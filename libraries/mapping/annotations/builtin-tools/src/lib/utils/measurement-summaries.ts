import { Cartesian3 } from "@carma-cesium";
import type { PolygonType } from "@carma-mapping/annotations/core";
import { cartesian3FromGeographicCoordinate } from "@carma-mapping/engines/cesium/core";

import type {
  CesiumGeographicCoordinate,
  StoredAnnotation,
} from "@carma-mapping/annotations/runtime";
import {
  resolveBearingDegFromFirstToLastCoordinate,
} from "@carma-mapping/annotations/runtime";
import {
  resolveDerivedAreaMeasurement,
  type DerivedAreaMeasurement,
} from "../area-shared/derived-area-measurement";

export type PolylineMeasurementSummary = {
  totalLengthMeters: number;
  segmentCount: number;
  meanSegmentLengthMeters: number;
  totalAbsoluteElevationChangeMeters: number;
  startEndElevationDeltaMeters: number;
  ascentMeters: number;
  descentMeters: number;
  bearingDeg: number | null;
};

export type AreaMeasurementSummary = DerivedAreaMeasurement & {
  perimeterMeters: number;
};

export const computePolylineSegmentLengthsMeters = (
  coordinates: readonly CesiumGeographicCoordinate[]
): readonly number[] =>
  coordinates.flatMap((startCoordinate, index) => {
    const endCoordinate = coordinates[index + 1];
    if (!startCoordinate || !endCoordinate) {
      return [];
    }

    return [
      Cartesian3.distance(
        cartesian3FromGeographicCoordinate(startCoordinate),
        cartesian3FromGeographicCoordinate(endCoordinate)
      ),
    ];
  });

export const computePolylineTotalLengthMeters = (
  coordinates: readonly CesiumGeographicCoordinate[]
): number =>
  computePolylineSegmentLengthsMeters(coordinates).reduce(
    (totalLengthMeters, segmentLengthMeters) =>
      totalLengthMeters + segmentLengthMeters,
    0
  );

const computeClosedCoordinatePathLengthMeters = (
  coordinates: readonly CesiumGeographicCoordinate[]
): number => {
  if (coordinates.length < 2) {
    return 0;
  }

  const pointsECEF = coordinates.map(cartesian3FromGeographicCoordinate);
  let totalLengthMeters = 0;

  for (let index = 0; index < pointsECEF.length; index += 1) {
    const startPoint = pointsECEF[index];
    const endPoint = pointsECEF[(index + 1) % pointsECEF.length];
    if (!startPoint || !endPoint) {
      continue;
    }

    totalLengthMeters += Cartesian3.distance(startPoint, endPoint);
  }

  return totalLengthMeters;
};

export const resolvePolylineMeasurementSummary = (
  coordinates: readonly CesiumGeographicCoordinate[]
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
    bearingDeg: resolveBearingDegFromFirstToLastCoordinate(coordinates),
  };
};

export const resolveAreaMeasurementSummary = ({
  measurement,
  toolType,
  coordinates,
}: {
  measurement: StoredAnnotation;
  toolType: PolygonType;
  coordinates: readonly CesiumGeographicCoordinate[];
}): AreaMeasurementSummary => ({
  perimeterMeters: computeClosedCoordinatePathLengthMeters(coordinates),
  ...resolveDerivedAreaMeasurement({
    measurement,
    toolType,
    coordinates,
  }),
});
