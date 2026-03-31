import type { PointAnnotationEntry } from "@carma-mapping/annotations/core";
import { Cartesian3, getDegreesFromCartesian } from "@carma/cesium";
const REFERENCE_POINT_MATCH_EPSILON_METERS = 0.001;

export type AnnotationDisplayPoint = {
  latitude: number;
  longitude: number;
  height: number;
  anchorHeight?: number;
  verticalOffset?: number;
};

export const resolvePointAnnotationDisplayPoint = (
  measurement: PointAnnotationEntry | null
): AnnotationDisplayPoint | null => {
  if (!measurement) return null;
  const anchorHeight = measurement.verticalOffsetAnchorECEF
    ? getDegreesFromCartesian(
        new Cartesian3(
          measurement.verticalOffsetAnchorECEF.x,
          measurement.verticalOffsetAnchorECEF.y,
          measurement.verticalOffsetAnchorECEF.z
        )
      ).altitude ?? 0
    : undefined;
  const verticalOffset =
    anchorHeight !== undefined
      ? measurement.geometryWGS84.altitude - anchorHeight
      : undefined;

  return {
    latitude: measurement.geometryWGS84.latitude,
    longitude: measurement.geometryWGS84.longitude,
    height: measurement.geometryWGS84.altitude,
    anchorHeight,
    verticalOffset,
  };
};

export const resolvePointRelativeElevation = (
  displayPoint: AnnotationDisplayPoint | null,
  referencePoint: PointAnnotationEntry["geometryECEF"] | null
): number | null => {
  if (!displayPoint || !referencePoint) return null;
  const referenceElevation =
    getDegreesFromCartesian(referencePoint).altitude ?? 0;
  return displayPoint.height - referenceElevation;
};

export const isPointReferenceMeasurement = (
  measurement: PointAnnotationEntry | null,
  referencePoint: PointAnnotationEntry["geometryECEF"] | null
): boolean => {
  if (!measurement || !referencePoint) return false;
  return (
    Cartesian3.distance(measurement.geometryECEF, referencePoint) <=
    REFERENCE_POINT_MATCH_EPSILON_METERS
  );
};

export const findReferencePointMeasurement = ({
  pointEntries,
  referencePoint,
}: {
  pointEntries: ReadonlyArray<PointAnnotationEntry>;
  referencePoint: PointAnnotationEntry["geometryECEF"] | null;
}): PointAnnotationEntry | null =>
  pointEntries.find((pointEntry) =>
    isPointReferenceMeasurement(pointEntry, referencePoint)
  ) ?? null;
