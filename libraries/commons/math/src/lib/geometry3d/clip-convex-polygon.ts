import type { Plane, Vector3 } from "three";
import { VECTOR3_NUMERIC_EPSILON } from "./constants";

const pushDistinctPolygonPoint = (
  polygon: Vector3[],
  point: Vector3,
  epsilon: number
) => {
  const previousPoint = polygon[polygon.length - 1];
  if (
    previousPoint &&
    previousPoint.distanceToSquared(point) <= epsilon * epsilon
  ) {
    return;
  }

  polygon.push(point);
};

const intersectLineSegmentWithPlane = (
  segmentStart: Vector3,
  segmentEnd: Vector3,
  plane: Plane,
  epsilon: number = VECTOR3_NUMERIC_EPSILON
): Vector3 | null => {
  const segmentDirection = segmentEnd.clone().sub(segmentStart);
  const denominator = segmentDirection.dot(plane.normal);
  if (Math.abs(denominator) <= epsilon) {
    return null;
  }

  const t = -plane.distanceToPoint(segmentStart) / denominator;
  if (!Number.isFinite(t) || t < -epsilon || t > 1 + epsilon) {
    return null;
  }

  return segmentStart
    .clone()
    .add(segmentDirection.multiplyScalar(Math.min(1, Math.max(0, t))));
};

const clipConvexPolygonByPlane = (
  polygon: readonly Vector3[],
  plane: Plane,
  epsilon: number = VECTOR3_NUMERIC_EPSILON
): Vector3[] => {
  if (polygon.length === 0) {
    return [];
  }

  const clippedPolygon: Vector3[] = [];
  let previousPoint = polygon[polygon.length - 1]!;
  let previousInside = plane.distanceToPoint(previousPoint) >= -epsilon;

  polygon.forEach((currentPoint) => {
    const currentDistance = plane.distanceToPoint(currentPoint);
    const currentInside = currentDistance >= -epsilon;

    if (previousInside !== currentInside) {
      const intersection = intersectLineSegmentWithPlane(
        previousPoint,
        currentPoint,
        plane,
        epsilon
      );

      if (intersection) {
        pushDistinctPolygonPoint(clippedPolygon, intersection, epsilon);
      }
    }

    if (currentInside) {
      pushDistinctPolygonPoint(clippedPolygon, currentPoint.clone(), epsilon);
    }

    previousPoint = currentPoint;
    previousInside = currentInside;
  });

  if (clippedPolygon.length >= 2) {
    const firstPoint = clippedPolygon[0]!;
    const lastPoint = clippedPolygon[clippedPolygon.length - 1]!;
    if (firstPoint.distanceToSquared(lastPoint) <= epsilon * epsilon) {
      clippedPolygon.pop();
    }
  }

  return clippedPolygon;
};

export const clipConvexPolygonByPlanes3d = (
  polygon: readonly Vector3[],
  clipPlanes: readonly Plane[],
  { epsilon = VECTOR3_NUMERIC_EPSILON }: { epsilon?: number } = {}
): Vector3[] =>
  clipPlanes.reduce(
    (currentPolygon, plane) =>
      clipConvexPolygonByPlane(currentPolygon, plane, epsilon),
    [...polygon]
  );
