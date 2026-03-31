import { useMemo } from "react";

import { Vector3 } from "three";

import {
  AnnotationCollection,
  NodeChainAnnotation,
  buildDerivedPolylinePaths,
  isPointAnnotationEntry,
} from "@carma-mapping/annotations/core";
import type { Cartesian3, Scene } from "@carma/cesium";
type UsePolylineBridgeParams = {
  scene: Scene;
  annotations: AnnotationCollection;
  nodeChainAnnotations: NodeChainAnnotation[];
  focusedNodeChainAnnotationId: string | null;
  defaultPolylineVerticalOffsetMeters: number;
  referencePoint: Cartesian3 | null;
};

const POLYLINE_VERTICAL_OFFSET_VISUAL_ONLY = true;
const tempPointA = new Vector3();
const tempPointB = new Vector3();

const distanceECEF = (
  pointA: { x: number; y: number; z: number },
  pointB: { x: number; y: number; z: number }
) => {
  tempPointA.set(pointA.x, pointA.y, pointA.z);
  tempPointB.set(pointB.x, pointB.y, pointB.z);
  return tempPointA.distanceTo(tempPointB);
};

export const usePolylineBridge = ({
  scene,
  annotations,
  nodeChainAnnotations,
  focusedNodeChainAnnotationId,
  defaultPolylineVerticalOffsetMeters,
  referencePoint,
}: UsePolylineBridgeParams) => {
  const referenceElevation = useMemo(() => {
    if (!referencePoint || !scene) return 0;
    const cartographic =
      scene.globe.ellipsoid.cartesianToCartographic(referencePoint);
    return cartographic?.height ?? 0;
  }, [referencePoint, scene]);

  const polylines = useMemo(
    () =>
      buildDerivedPolylinePaths({
        annotations,
        nodeChainAnnotations,
        defaultVerticalOffsetMeters: defaultPolylineVerticalOffsetMeters,
        useOffsetAnchors: POLYLINE_VERTICAL_OFFSET_VISUAL_ONLY,
      }),
    [defaultPolylineVerticalOffsetMeters, annotations, nodeChainAnnotations]
  );

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
      distances[measurement.id] = distanceECEF(
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
    polylines,
    focusedPolylineDistanceToStartByPointId,
    cumulativeDistanceByRelationId,
    effectiveReferenceElevation,
    effectiveDistanceToReferenceByPointId,
    unfocusedPolylineNonLastIds,
  };
};
