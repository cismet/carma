import type { Meters } from "@carma-units";

import { Cartesian3 } from "@carma-cesium";

const CARTESIAN3_NUMERIC_EPSILON_SQUARED = 1e-12;
const CARTESIAN3_NUMERIC_EPSILON = 1e-6;
/**
 * Calculate distance between two Cartesian3 points.
 */
export const cartesian3Distance = (
  cartesian1: Cartesian3,
  cartesian2: Cartesian3
): Meters => Cartesian3.distance(cartesian1, cartesian2) as Meters;

/**
 * Apply a constant offset to a list of Cartesian3 positions.
 */
export const offsetCartesian3Positions = (
  positions: readonly Cartesian3[],
  offset: Cartesian3
): Cartesian3[] =>
  positions.map((position) =>
    Cartesian3.add(position, offset, new Cartesian3())
  );

/**
 * Removes the component of a vector that lies along the given axis.
 * Works with non-normalized axes.
 */
export const removeCartesian3ComponentAlongAxis = (
  vector: Cartesian3,
  axisDirection: Cartesian3,
  result: Cartesian3 = new Cartesian3()
): Cartesian3 => {
  const axisMagnitudeSquared = Cartesian3.magnitudeSquared(axisDirection);
  if (axisMagnitudeSquared <= CARTESIAN3_NUMERIC_EPSILON_SQUARED) {
    return Cartesian3.clone(vector, result);
  }

  const projectionScale =
    Cartesian3.dot(vector, axisDirection) / axisMagnitudeSquared;
  return Cartesian3.subtract(
    vector,
    Cartesian3.multiplyByScalar(
      axisDirection,
      projectionScale,
      new Cartesian3()
    ),
    result
  );
};

/**
 * Projects a world-space point onto a plane.
 * Works with non-normalized plane normals.
 */
export const projectCartesian3PointOntoPlane = (
  point: Cartesian3,
  planeOrigin: Cartesian3,
  planeNormal: Cartesian3,
  result: Cartesian3 = new Cartesian3()
): Cartesian3 => {
  const planeNormalMagnitudeSquared = Cartesian3.magnitudeSquared(planeNormal);
  if (planeNormalMagnitudeSquared <= CARTESIAN3_NUMERIC_EPSILON_SQUARED) {
    return Cartesian3.clone(point, result);
  }

  const delta = Cartesian3.subtract(point, planeOrigin, new Cartesian3());
  const normalScale =
    Cartesian3.dot(delta, planeNormal) / planeNormalMagnitudeSquared;
  return Cartesian3.subtract(
    point,
    Cartesian3.multiplyByScalar(planeNormal, normalScale, new Cartesian3()),
    result
  );
};

/**
 * Returns the signed point-to-plane distance along the plane normal.
 * Works with non-normalized plane normals.
 */
export const getSignedCartesian3DistanceToPlane = (
  point: Cartesian3,
  planeOrigin: Cartesian3,
  planeNormal: Cartesian3
): number => {
  const planeNormalMagnitude = Cartesian3.magnitude(planeNormal);
  if (planeNormalMagnitude <= CARTESIAN3_NUMERIC_EPSILON) {
    return 0;
  }

  const delta = Cartesian3.subtract(point, planeOrigin, new Cartesian3());
  return Cartesian3.dot(delta, planeNormal) / planeNormalMagnitude;
};

/**
 * Returns the normalized triangle normal, or null for degenerate input.
 */
export const getNormalizedCartesian3TriangleNormal = (
  a: Cartesian3,
  b: Cartesian3,
  c: Cartesian3,
  result: Cartesian3 = new Cartesian3()
): Cartesian3 | null => {
  const ab = Cartesian3.subtract(b, a, new Cartesian3());
  const ac = Cartesian3.subtract(c, a, new Cartesian3());
  const normal = Cartesian3.cross(ab, ac, result);
  if (
    Cartesian3.magnitudeSquared(normal) <= CARTESIAN3_NUMERIC_EPSILON_SQUARED
  ) {
    return null;
  }

  return Cartesian3.normalize(normal, result);
};
