import { useMemo } from "react";

import { Cartesian3 } from "@carma/cesium";
import {
  isPointAnnotationEntry,
  type AnnotationCollection,
  type DerivedPolylinePath,
} from "@carma-mapping/annotations/core";

type UseAnnotationsPolylineStateOptions = {
  focusedNodeChainAnnotationId: string | null;
  referencePoint: Cartesian3 | null;
  referenceElevation: number;
};

export const useAnnotationsPolylineState = (
  annotations: AnnotationCollection,
  polylines: DerivedPolylinePath[],
  {
    focusedNodeChainAnnotationId,
    referencePoint,
    referenceElevation,
  }: UseAnnotationsPolylineStateOptions
) => {
  const focusedPolyline = useMemo(() => {
    if (!focusedNodeChainAnnotationId) {
      return null;
    }

    return (
      polylines.find(
        (polyline) => polyline.id === focusedNodeChainAnnotationId
      ) ?? null
    );
  }, [focusedNodeChainAnnotationId, polylines]);

  const focusedPolylineStartPointId =
    focusedPolyline?.distanceMeasurementStartPointId ??
    focusedPolyline?.nodeIds[0] ??
    null;

  const focusedPolylineDistanceToStartByPointId = useMemo(() => {
    if (!focusedPolyline) {
      return {};
    }

    const byId: Record<string, number> = {};
    focusedPolyline.nodeIds.forEach((pointId, index) => {
      byId[pointId] =
        focusedPolyline.segmentLengthsCumulativeMeters[index] ?? 0;
    });
    return byId;
  }, [focusedPolyline]);

  const cumulativeDistanceByRelationId = useMemo(() => {
    const byRelationId: Record<string, number> = {};
    polylines.forEach((polyline) => {
      polyline.edgeRelationIds.forEach((relationId, segmentIndex) => {
        byRelationId[relationId] =
          polyline.segmentLengthsCumulativeMeters[segmentIndex + 1] ??
          polyline.segmentLengthsCumulativeMeters[segmentIndex] ??
          0;
      });
    });
    return byRelationId;
  }, [polylines]);

  const effectiveReferenceElevation = useMemo(() => {
    if (!focusedPolylineStartPointId) {
      return referenceElevation;
    }

    if (focusedPolyline) {
      const focusedStartPointIndex = focusedPolyline.nodeIds.findIndex(
        (pointId) => pointId === focusedPolylineStartPointId
      );
      if (focusedStartPointIndex >= 0) {
        return focusedPolyline.nodeHeightsMeters[focusedStartPointIndex] ?? 0;
      }
    }

    return referenceElevation;
  }, [focusedPolyline, focusedPolylineStartPointId, referenceElevation]);

  const distanceToReferenceByPointId = useMemo(() => {
    if (!referencePoint) {
      return {};
    }

    const distances: Record<string, number> = {};
    annotations.forEach((measurement) => {
      if (!isPointAnnotationEntry(measurement)) {
        return;
      }
      distances[measurement.id] = Cartesian3.distance(
        measurement.geometryECEF,
        referencePoint
      );
    });
    return distances;
  }, [annotations, referencePoint]);

  const effectiveDistanceToReferenceByPointId = useMemo(() => {
    if (!focusedPolyline) {
      return distanceToReferenceByPointId;
    }

    return {
      ...distanceToReferenceByPointId,
      ...focusedPolylineDistanceToStartByPointId,
    };
  }, [
    distanceToReferenceByPointId,
    focusedPolyline,
    focusedPolylineDistanceToStartByPointId,
  ]);

  const unfocusedPolylineMarkerOnlyPointIds = useMemo(() => {
    const ids = new Set<string>();
    polylines.forEach((polyline) => {
      if (polyline.id === focusedNodeChainAnnotationId) {
        return;
      }
      const first = polyline.nodeIds[0];
      const last = polyline.nodeIds[polyline.nodeIds.length - 1];
      if (first && first !== last) {
        ids.add(first);
      }
    });
    return ids;
  }, [focusedNodeChainAnnotationId, polylines]);

  const unfocusedPolylineInteriorIds = useMemo(() => {
    const ids = new Set<string>();
    polylines.forEach((polyline) => {
      if (polyline.id === focusedNodeChainAnnotationId) {
        return;
      }
      polyline.nodeIds.forEach((pointId, index) => {
        if (index === 0 || index === polyline.nodeIds.length - 1) {
          return;
        }
        ids.add(pointId);
      });
    });
    return ids;
  }, [focusedNodeChainAnnotationId, polylines]);

  const unfocusedPolylineNonLastIds = useMemo(() => {
    const ids = new Set<string>(unfocusedPolylineMarkerOnlyPointIds);
    unfocusedPolylineInteriorIds.forEach((pointId) => {
      ids.add(pointId);
    });
    return ids;
  }, [unfocusedPolylineInteriorIds, unfocusedPolylineMarkerOnlyPointIds]);

  return {
    focusedPolylineDistanceToStartByPointId,
    cumulativeDistanceByRelationId,
    effectiveReferenceElevation,
    effectiveDistanceToReferenceByPointId,
    unfocusedPolylineNonLastIds,
  };
};
