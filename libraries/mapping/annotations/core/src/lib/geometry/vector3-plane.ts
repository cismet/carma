import { Vector3 } from "three";

/**
 * Plane and direction helpers on `THREE.Vector3`, ported from the Cesium
 * `Cartesian3` helpers in `@carma-mapping/engines/cesium/core`
 * (`cartesian3/Math.ts`, `Transforms.ts`). Same epsilons, same fallbacks.
 */

const NUMERIC_EPSILON_SQUARED = 1e-12;
const NUMERIC_EPSILON = 1e-6;
const ARC_POINT_EPSILON_METERS = 1e-6;

/** Port of `normalizeDirection`: null for a degenerate direction. */
export const normalizeDirection = (direction: Vector3): Vector3 | null =>
  direction.lengthSq() <= NUMERIC_EPSILON_SQUARED
    ? null
    : direction.clone().normalize();

/** Port of `removeCartesian3ComponentAlongAxis`. */
export const removeVector3ComponentAlongAxis = (
  vector: Vector3,
  axisDirection: Vector3,
  out: Vector3 = new Vector3()
): Vector3 => {
  const axisMagnitudeSquared = axisDirection.lengthSq();
  if (axisMagnitudeSquared <= NUMERIC_EPSILON_SQUARED) {
    return out.copy(vector);
  }
  const projectionScale = vector.dot(axisDirection) / axisMagnitudeSquared;
  return out.copy(vector).addScaledVector(axisDirection, -projectionScale);
};

/** Port of `projectCartesian3PointOntoPlane`. */
export const projectVector3OntoPlane = (
  point: Vector3,
  planeOrigin: Vector3,
  planeNormal: Vector3,
  out: Vector3 = new Vector3()
): Vector3 => {
  const normalMagnitudeSquared = planeNormal.lengthSq();
  if (normalMagnitudeSquared <= NUMERIC_EPSILON_SQUARED) {
    return out.copy(point);
  }
  const normalScale =
    (point.x - planeOrigin.x) * planeNormal.x +
    (point.y - planeOrigin.y) * planeNormal.y +
    (point.z - planeOrigin.z) * planeNormal.z;
  return out
    .copy(point)
    .addScaledVector(planeNormal, -normalScale / normalMagnitudeSquared);
};

/** Port of `getSignedCartesian3DistanceToPlane`. */
export const getSignedVector3DistanceToPlane = (
  point: Vector3,
  planeOrigin: Vector3,
  planeNormal: Vector3
): number => {
  const normalMagnitude = planeNormal.length();
  if (normalMagnitude <= NUMERIC_EPSILON) {
    return 0;
  }
  return (
    ((point.x - planeOrigin.x) * planeNormal.x +
      (point.y - planeOrigin.y) * planeNormal.y +
      (point.z - planeOrigin.z) * planeNormal.z) /
    normalMagnitude
  );
};

/** Port of `getNormalizedCartesian3TriangleNormal`. */
export const getNormalizedTriangleNormal = (
  a: Vector3,
  b: Vector3,
  c: Vector3,
  out: Vector3 = new Vector3()
): Vector3 | null => {
  const ab = new Vector3().subVectors(b, a);
  const ac = new Vector3().subVectors(c, a);
  out.crossVectors(ab, ac);
  if (out.lengthSq() <= NUMERIC_EPSILON_SQUARED) {
    return null;
  }
  return out.normalize();
};

/** Port of `projectPointToHorizontalPlaneAtAnchor` with a caller-supplied up. */
export const projectPointToPlaneAtAnchor = (
  point: Vector3,
  anchor: Vector3,
  up: Vector3
): Vector3 => projectVector3OntoPlane(point, anchor, up);

/**
 * Port of `getArcPointsInSpannedPlane`: the arc of `arcRadiusMeters` around
 * `auxiliaryPoint` from the vertical leg toward the horizontal leg of a
 * distance triangle, or null when the legs do not span a plane.
 */
export const getArcPointsInSpannedPlane = (
  auxiliaryPoint: Vector3,
  verticalTargetPoint: Vector3,
  horizontalTargetPoint: Vector3,
  arcRadiusMeters: number,
  segmentCount: number
): Vector3[] | null => {
  if (!Number.isFinite(arcRadiusMeters) || arcRadiusMeters <= 0) return null;
  const verticalVector = new Vector3().subVectors(
    verticalTargetPoint,
    auxiliaryPoint
  );
  const horizontalVector = new Vector3().subVectors(
    horizontalTargetPoint,
    auxiliaryPoint
  );
  const verticalLength = verticalVector.length();
  const horizontalLength = horizontalVector.length();
  if (verticalLength <= ARC_POINT_EPSILON_METERS) return null;
  if (horizontalLength <= ARC_POINT_EPSILON_METERS) return null;
  const verticalDirection = verticalVector.clone().normalize();
  const horizontalDirectionRaw = horizontalVector.clone().normalize();
  const dot = Math.max(
    -1,
    Math.min(1, verticalDirection.dot(horizontalDirectionRaw))
  );
  const angleRad = Math.acos(dot);
  if (!Number.isFinite(angleRad) || angleRad <= 1e-3) return null;
  const horizontalOrthogonal = horizontalDirectionRaw
    .clone()
    .addScaledVector(verticalDirection, -dot);
  if (horizontalOrthogonal.length() <= 1e-5) return null;
  const horizontalDirection = horizontalOrthogonal.normalize();
  const safeRadius = Math.min(
    arcRadiusMeters,
    verticalLength * 0.999,
    horizontalLength * 0.999
  );
  if (safeRadius <= ARC_POINT_EPSILON_METERS) return null;
  const points: Vector3[] = [];
  const segments = Math.max(8, segmentCount);
  for (let index = 0; index <= segments; index += 1) {
    const theta = angleRad * (index / segments);
    const direction = new Vector3()
      .addScaledVector(verticalDirection, Math.cos(theta))
      .addScaledVector(horizontalDirection, Math.sin(theta))
      .normalize();
    points.push(direction.multiplyScalar(safeRadius).add(auxiliaryPoint));
  }
  return points.length >= 2 ? points : null;
};
