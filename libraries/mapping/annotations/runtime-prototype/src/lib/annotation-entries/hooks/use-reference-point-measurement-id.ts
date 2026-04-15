import { useMemo } from "react";

import {
  isPointAnnotationEntry,
  type AnnotationCollection,
} from "@carma-mapping/annotations/core";
import { Cartesian3 } from "@carma-cesium";
export const useReferencePointMeasurementId = (
  annotations: AnnotationCollection,
  referencePoint: Cartesian3 | null,
  referencePointSyncEpsilonMeters: number
) =>
  useMemo(() => {
    if (!referencePoint) return null;
    const pointMeasurement = annotations.find(
      (measurement) =>
        isPointAnnotationEntry(measurement) &&
        Cartesian3.distance(measurement.geometryECEF, referencePoint) <=
          referencePointSyncEpsilonMeters
    );
    return pointMeasurement && isPointAnnotationEntry(pointMeasurement)
      ? pointMeasurement.id
      : null;
  }, [annotations, referencePoint, referencePointSyncEpsilonMeters]);
