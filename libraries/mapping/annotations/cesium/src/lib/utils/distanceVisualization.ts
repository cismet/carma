import { Cartesian3 } from "@carma/cesium";

import type {
  PointDistanceRelation,
  PointMeasurementEntry,
} from "../types/MeasurementTypes";

export const REFERENCE_LINE_EPSILON_METERS = 0.001;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const getArcPointsInSpannedPlane = (
  auxiliaryPoint: Cartesian3,
  verticalTargetPoint: Cartesian3,
  horizontalTargetPoint: Cartesian3,
  arcRadiusMeters: number,
  segmentCount: number
): Cartesian3[] | null => {
  if (!Number.isFinite(arcRadiusMeters) || arcRadiusMeters <= 0) return null;

  const verticalVector = Cartesian3.subtract(
    verticalTargetPoint,
    auxiliaryPoint,
    new Cartesian3()
  );
  const horizontalVector = Cartesian3.subtract(
    horizontalTargetPoint,
    auxiliaryPoint,
    new Cartesian3()
  );
  const verticalLength = Cartesian3.magnitude(verticalVector);
  const horizontalLength = Cartesian3.magnitude(horizontalVector);

  if (verticalLength <= REFERENCE_LINE_EPSILON_METERS) return null;
  if (horizontalLength <= REFERENCE_LINE_EPSILON_METERS) return null;

  const verticalDirection = Cartesian3.normalize(
    verticalVector,
    new Cartesian3()
  );
  const horizontalDirectionRaw = Cartesian3.normalize(
    horizontalVector,
    new Cartesian3()
  );
  const dot = clamp(
    Cartesian3.dot(verticalDirection, horizontalDirectionRaw),
    -1,
    1
  );
  const angleRad = Math.acos(dot);
  if (!Number.isFinite(angleRad) || angleRad <= 1e-3) return null;

  const horizontalOrthogonal = Cartesian3.subtract(
    horizontalDirectionRaw,
    Cartesian3.multiplyByScalar(verticalDirection, dot, new Cartesian3()),
    new Cartesian3()
  );
  if (Cartesian3.magnitude(horizontalOrthogonal) <= 1e-5) return null;

  const horizontalDirection = Cartesian3.normalize(
    horizontalOrthogonal,
    new Cartesian3()
  );
  const safeRadius = Math.min(
    arcRadiusMeters,
    verticalLength * 0.999,
    horizontalLength * 0.999
  );
  if (safeRadius <= REFERENCE_LINE_EPSILON_METERS) return null;

  const points: Cartesian3[] = [];
  const segments = Math.max(8, segmentCount);
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const theta = angleRad * t;
    const direction = Cartesian3.add(
      Cartesian3.multiplyByScalar(
        verticalDirection,
        Math.cos(theta),
        new Cartesian3()
      ),
      Cartesian3.multiplyByScalar(
        horizontalDirection,
        Math.sin(theta),
        new Cartesian3()
      ),
      new Cartesian3()
    );
    const normalizedDirection = Cartesian3.normalize(
      direction,
      new Cartesian3()
    );
    points.push(
      Cartesian3.add(
        auxiliaryPoint,
        Cartesian3.multiplyByScalar(
          normalizedDirection,
          safeRadius,
          new Cartesian3()
        ),
        new Cartesian3()
      )
    );
  }

  return points.length >= 2 ? points : null;
};

export type ResolvedDistanceRelation = {
  relation: PointDistanceRelation;
  pointA: PointMeasurementEntry;
  pointB: PointMeasurementEntry;
  anchorPoint: PointMeasurementEntry;
  targetPoint: PointMeasurementEntry;
  auxiliaryPoint: Cartesian3;
};

export const resolveDistanceRelation = (
  relation: PointDistanceRelation,
  pointsById: Map<string, PointMeasurementEntry>
): ResolvedDistanceRelation | null => {
  const pointA = pointsById.get(relation.pointAId);
  const pointB = pointsById.get(relation.pointBId);
  if (!pointA || !pointB) return null;
  if (
    Cartesian3.distance(pointA.geometryECEF, pointB.geometryECEF) <=
    REFERENCE_LINE_EPSILON_METERS
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
  const auxiliaryPoint = Cartesian3.fromDegrees(
    anchorPoint.geometryWGS84.longitude,
    anchorPoint.geometryWGS84.latitude,
    targetPoint.geometryWGS84.height
  );

  return {
    relation,
    pointA,
    pointB,
    anchorPoint,
    targetPoint,
    auxiliaryPoint,
  };
};
