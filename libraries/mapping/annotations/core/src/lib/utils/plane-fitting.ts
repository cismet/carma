import {
  getNormalizedTriangleNormal,
  getVector3Centroid,
  normalizeDirection,
} from "@carma-commons/math";
import {
  metricVector3FromVector3,
  vector3FromMetricVector3,
} from "@carma-geo/proj";
import { Vector3 } from "three";

import type { PlanarPolygonPlane } from "../types/annotation-types";
import {
  computeCovarianceMatrix3,
  resolveSmallestEigenVectorSymmetricMatrix3,
} from "./symmetric-matrix3-eigen";

/** Squared length below which a vector counts as zero. */
const MAGNITUDE_SQUARED_EPSILON = 1e-8;

type TriangleVertexSet = readonly [Vector3, Vector3, Vector3];

const getTriangleNormalMagnitudeSquared = (
  a: Vector3,
  b: Vector3,
  c: Vector3
): number =>
  new Vector3()
    .crossVectors(
      new Vector3().subVectors(b, a),
      new Vector3().subVectors(c, a)
    )
    .lengthSq();

/** Largest triangle among the polygon-neighbour triples (linear, not all triples). */
const findLargestConsecutiveTriangleVertices = (
  vertices: readonly Vector3[]
): TriangleVertexSet | null => {
  if (vertices.length < 3) return null;

  let bestTriangle: TriangleVertexSet | null = null;
  let bestMagnitudeSquared = MAGNITUDE_SQUARED_EPSILON;

  for (let index = 0; index < vertices.length; index += 1) {
    const first = vertices[index];
    const second = vertices[(index + 1) % vertices.length];
    const third = vertices[(index + 2) % vertices.length];
    if (!first || !second || !third) continue;

    const magnitudeSquared = getTriangleNormalMagnitudeSquared(
      first,
      second,
      third
    );
    if (magnitudeSquared > bestMagnitudeSquared) {
      bestMagnitudeSquared = magnitudeSquared;
      bestTriangle = [first, second, third];
    }
  }

  return bestTriangle;
};

const findFirstNonCollinearTriangleVertices = (
  vertices: readonly Vector3[]
): TriangleVertexSet | null => {
  for (let i = 0; i < vertices.length - 2; i += 1) {
    for (let j = i + 1; j < vertices.length - 1; j += 1) {
      for (let k = j + 1; k < vertices.length; k += 1) {
        const a = vertices[i];
        const b = vertices[j];
        const c = vertices[k];
        if (
          a &&
          b &&
          c &&
          getTriangleNormalMagnitudeSquared(a, b, c) > MAGNITUDE_SQUARED_EPSILON
        ) {
          return [a, b, c];
        }
      }
    }
  }

  return null;
};

/** Flips the plane normal to face the reference position; unchanged without one. */
const orientPlaneNormalTowardPosition = (
  plane: PlanarPolygonPlane,
  referencePositionECEF?: Vector3 | null
): PlanarPolygonPlane => {
  if (!referencePositionECEF) return plane;

  const anchor = vector3FromMetricVector3(plane.anchorECEF);
  const normal = normalizeDirection(vector3FromMetricVector3(plane.normalECEF));
  if (!normal) return plane;

  const toReference = new Vector3().subVectors(referencePositionECEF, anchor);
  if (toReference.lengthSq() <= MAGNITUDE_SQUARED_EPSILON) return plane;
  if (normal.dot(toReference) >= 0) return plane;

  return {
    ...plane,
    normalECEF: metricVector3FromVector3(normal.negate()),
  };
};

const createPlaneFromTriangle = (
  triangle: TriangleVertexSet | null,
  preferredFacingPositionECEF?: Vector3 | null
): PlanarPolygonPlane | null => {
  if (!triangle) return null;
  const [a, b, c] = triangle;
  const normal = getNormalizedTriangleNormal(a, b, c);
  if (!normal) return null;

  return orientPlaneNormalTowardPosition(
    {
      anchorECEF: metricVector3FromVector3(a),
      normalECEF: metricVector3FromVector3(normal),
    },
    preferredFacingPositionECEF
  );
};

export const createPlaneFromFirstNonCollinearPoints = (
  vertices: readonly Vector3[],
  preferredFacingPositionECEF?: Vector3 | null
): PlanarPolygonPlane | null =>
  createPlaneFromTriangle(
    findFirstNonCollinearTriangleVertices(vertices),
    preferredFacingPositionECEF
  );

export const createPlaneFromLargestTriangle = (
  vertices: readonly Vector3[],
  preferredFacingPositionECEF?: Vector3 | null
): PlanarPolygonPlane | null =>
  createPlaneFromTriangle(
    findLargestConsecutiveTriangleVertices(vertices),
    preferredFacingPositionECEF
  );

/** Principal-component plane through the centroid; null for fewer than three non-collinear points. */
export const createBestFitPlanePca = (
  vertices: readonly Vector3[],
  preferredFacingPositionECEF?: Vector3 | null
): PlanarPolygonPlane | null => {
  if (
    vertices.length < 3 ||
    !findLargestConsecutiveTriangleVertices(vertices)
  ) {
    return null;
  }

  const anchor = getVector3Centroid(vertices);
  const normal =
    anchor &&
    resolveSmallestEigenVectorSymmetricMatrix3(
      computeCovarianceMatrix3(vertices, anchor)
    );
  if (!anchor || !normal) return null;

  return orientPlaneNormalTowardPosition(
    {
      anchorECEF: metricVector3FromVector3(anchor),
      normalECEF: metricVector3FromVector3(normal),
    },
    preferredFacingPositionECEF
  );
};
