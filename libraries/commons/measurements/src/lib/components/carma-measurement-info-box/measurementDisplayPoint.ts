import { Cartesian3, getDegreesFromCartesian } from "@carma/cesium";
import type { PointMeasurementEntry } from "@carma-mapping/annotations/cesium";

import type { MeasurementDisplayPoint } from "./getCarmaMeasurementInfoBoxSlots";

const REFERENCE_POINT_MATCH_EPSILON_METERS = 0.001;

export const resolveMeasurementDisplayPoint = ({
  measurement,
}: {
  measurement: PointMeasurementEntry | null;
}): MeasurementDisplayPoint | null => {
  if (!measurement) return null;
  return {
    latitude: measurement.geometryWGS84.latitude,
    longitude: measurement.geometryWGS84.longitude,
    height: measurement.geometryWGS84.height,
  };
};

export const resolveRelativeElevation = ({
  displayPoint,
  referencePoint,
}: {
  displayPoint: MeasurementDisplayPoint | null;
  referencePoint: Cartesian3 | null;
}): number | null => {
  if (!displayPoint || !referencePoint) return null;
  const referenceElevation =
    getDegreesFromCartesian(referencePoint).altitude ?? 0;
  return displayPoint.height - referenceElevation;
};

export const isReferenceMeasurement = ({
  measurement,
  referencePoint,
}: {
  measurement: PointMeasurementEntry | null;
  referencePoint: Cartesian3 | null;
}): boolean => {
  if (!measurement || !referencePoint) return false;
  return (
    Cartesian3.distance(measurement.geometryECEF, referencePoint) <=
    REFERENCE_POINT_MATCH_EPSILON_METERS
  );
};
