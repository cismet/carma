import type { Vector3 } from "three";

import {
  ecefFromGeographicCoordinate,
  getEllipsoidalAltitudeOrZero,
} from "../geometry";
import type { AnnotationPointEntry } from "../types/annotation-geometry-types";
import type { PointDistanceRelation } from "../types/distance-relation";

export const distanceVisualizationDefaults = Object.freeze({
  referenceLineEpsilonMeters: 0.001,
});

export type ResolvedDistanceRelation = {
  relation: PointDistanceRelation;
  pointA: AnnotationPointEntry;
  pointB: AnnotationPointEntry;
  anchorPoint: AnnotationPointEntry;
  targetPoint: AnnotationPointEntry;
  auxiliaryPoint: Vector3;
};

export const resolveDistanceRelation = (
  relation: PointDistanceRelation,
  pointsById: Map<string, AnnotationPointEntry>
): ResolvedDistanceRelation | null => {
  const pointA = pointsById.get(relation.pointAId);
  const pointB = pointsById.get(relation.pointBId);
  if (!pointA || !pointB) return null;
  if (
    pointA.geometryECEF.distanceTo(pointB.geometryECEF) <=
    distanceVisualizationDefaults.referenceLineEpsilonMeters
  ) {
    return null;
  }

  const anchorPoint =
    relation.anchorPointId === pointB.id || relation.anchorPointId === pointA.id
      ? relation.anchorPointId === pointB.id
        ? pointB
        : pointA
      : pointA;
  const targetPoint = anchorPoint.id === pointA.id ? pointB : pointA;
  const auxiliaryPoint = ecefFromGeographicCoordinate({
    longitude: anchorPoint.geometryWGS84.longitude,
    latitude: anchorPoint.geometryWGS84.latitude,
    altitude: getEllipsoidalAltitudeOrZero(targetPoint.geometryWGS84.altitude),
  });

  return {
    relation,
    pointA,
    pointB,
    anchorPoint,
    targetPoint,
    auxiliaryPoint,
  };
};
