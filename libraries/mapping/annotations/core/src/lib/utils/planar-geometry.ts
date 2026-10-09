import { getPolygonArea2d } from "@carma-commons/math";
import { Matrix3 as ThreeMatrix3, Vector3 } from "three";
import { ecefToEnuMatrix } from "@carma-geo/proj";
import { radToDegNumeric, type Radians, zeroToTwoPi } from "@carma-units";

import {
  getEllipsoidalUpDirectionAtAnchor,
  getNormalizedTriangleNormal,
  getSignedVector3DistanceToPlane,
  metricVector3FromVector3,
  normalizeDirection,
  projectVector3OntoPlane,
  removeVector3ComponentAlongAxis,
  vector3FromMetricVector3,
} from "../geometry";
import {
  ANNOTATION_TYPES,
  type AnnotationTypes,
} from "../types/annotation-types";
import type {
  DerivedNodeChainAnnotation,
  DerivedNodeChainAnnotationGeometry,
  NodeChainAnnotation,
  PlanarPolygonLocalFrame,
  PlanarPolygonPlane,
} from "../types/annotation-types";

const planarGeometryDefaults = Object.freeze({
  bearingHorizontalMagnitudeEpsilon: 1e-8,
  cartesianMagnitudeSquaredEpsilon: 1e-8,
  polygonTypeVerticalityThresholdDeg: 85,
});

type Matrix3 = [
  [number, number, number],
  [number, number, number],
  [number, number, number]
];

type TriangleVertexSet = readonly [Vector3, Vector3, Vector3];

const createIdentityMatrix3 = (): Matrix3 => [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

const getMatrix3Value = (
  matrix: Matrix3,
  rowIndex: number,
  columnIndex: number
): number => matrix[rowIndex]?.[columnIndex] ?? 0;

const setMatrix3Value = (
  matrix: Matrix3,
  rowIndex: number,
  columnIndex: number,
  value: number
) => {
  const row = matrix[rowIndex];
  if (row) {
    row[columnIndex] = value;
  }
};

const getTriangleNormalMagnitudeSquared = (
  a: Vector3,
  b: Vector3,
  c: Vector3
): number => {
  const ab = new Vector3().subVectors(b, a);
  const ac = new Vector3().subVectors(c, a);
  return new Vector3().crossVectors(ab, ac).lengthSq();
};

const getConsecutiveTriangleVertices = (
  vertices: readonly Vector3[],
  startIndex: number
): TriangleVertexSet | null => {
  const first = vertices[startIndex];
  const second = vertices[(startIndex + 1) % vertices.length];
  const third = vertices[(startIndex + 2) % vertices.length];
  return first && second && third ? [first, second, third] : null;
};

const findLargestConsecutiveTriangleVertices = (
  vertices: readonly Vector3[]
): TriangleVertexSet | null => {
  if (vertices.length < 3) return null;

  let bestTriangle: TriangleVertexSet | null = null;
  let bestMagnitudeSquared: number =
    planarGeometryDefaults.cartesianMagnitudeSquaredEpsilon;

  for (let i = 0; i < vertices.length; i += 1) {
    const triangle = getConsecutiveTriangleVertices(vertices, i);
    if (!triangle) continue;

    const magnitudeSquared = getTriangleNormalMagnitudeSquared(
      triangle[0],
      triangle[1],
      triangle[2]
    );
    if (magnitudeSquared > bestMagnitudeSquared) {
      bestMagnitudeSquared = magnitudeSquared;
      bestTriangle = triangle;
    }
  }

  return bestTriangle;
};

const findFirstNonCollinearTriangleVertices = (
  vertices: readonly Vector3[]
): TriangleVertexSet | null => {
  if (vertices.length < 3) return null;

  for (let i = 0; i < vertices.length - 2; i += 1) {
    for (let j = i + 1; j < vertices.length - 1; j += 1) {
      for (let k = j + 1; k < vertices.length; k += 1) {
        const a = vertices[i];
        const b = vertices[j];
        const c = vertices[k];
        if (!a || !b || !c) continue;

        if (
          getTriangleNormalMagnitudeSquared(a, b, c) >
          planarGeometryDefaults.cartesianMagnitudeSquaredEpsilon
        ) {
          return [a, b, c];
        }
      }
    }
  }

  return null;
};

const findLargestOffDiagonalMatrix3Entry = (matrix: Matrix3) => {
  const entries = [
    {
      rowIndex: 0,
      columnIndex: 1,
      value: Math.abs(getMatrix3Value(matrix, 0, 1)),
    },
    {
      rowIndex: 0,
      columnIndex: 2,
      value: Math.abs(getMatrix3Value(matrix, 0, 2)),
    },
    {
      rowIndex: 1,
      columnIndex: 2,
      value: Math.abs(getMatrix3Value(matrix, 1, 2)),
    },
  ];

  return entries.reduce((best, entry) =>
    entry.value > best.value ? entry : best
  );
};

const resolveSmallestEigenVectorSymmetricMatrix3 = (
  sourceMatrix: Matrix3
): Vector3 | null => {
  const matrix: Matrix3 = sourceMatrix.map((row) => [...row]) as Matrix3;
  const eigenvectors = createIdentityMatrix3();

  for (let iteration = 0; iteration < 32; iteration += 1) {
    const { rowIndex, columnIndex, value } =
      findLargestOffDiagonalMatrix3Entry(matrix);
    if (value <= 1e-10) break;

    const pp = getMatrix3Value(matrix, rowIndex, rowIndex);
    const qq = getMatrix3Value(matrix, columnIndex, columnIndex);
    const pq = getMatrix3Value(matrix, rowIndex, columnIndex);
    const angle = 0.5 * Math.atan2(2 * pq, qq - pp);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    for (let index = 0; index < 3; index += 1) {
      if (index === rowIndex || index === columnIndex) continue;

      const ip = getMatrix3Value(matrix, index, rowIndex);
      const iq = getMatrix3Value(matrix, index, columnIndex);
      const nextIp = cos * ip - sin * iq;
      const nextIq = sin * ip + cos * iq;
      setMatrix3Value(matrix, index, rowIndex, nextIp);
      setMatrix3Value(matrix, rowIndex, index, nextIp);
      setMatrix3Value(matrix, index, columnIndex, nextIq);
      setMatrix3Value(matrix, columnIndex, index, nextIq);
    }

    setMatrix3Value(
      matrix,
      rowIndex,
      rowIndex,
      cos * cos * pp - 2 * sin * cos * pq + sin * sin * qq
    );
    setMatrix3Value(
      matrix,
      columnIndex,
      columnIndex,
      sin * sin * pp + 2 * sin * cos * pq + cos * cos * qq
    );
    setMatrix3Value(matrix, rowIndex, columnIndex, 0);
    setMatrix3Value(matrix, columnIndex, rowIndex, 0);

    for (let index = 0; index < 3; index += 1) {
      const vectorIp = getMatrix3Value(eigenvectors, index, rowIndex);
      const vectorIq = getMatrix3Value(eigenvectors, index, columnIndex);
      setMatrix3Value(
        eigenvectors,
        index,
        rowIndex,
        cos * vectorIp - sin * vectorIq
      );
      setMatrix3Value(
        eigenvectors,
        index,
        columnIndex,
        sin * vectorIp + cos * vectorIq
      );
    }
  }

  let smallestEigenValueIndex = 0;
  for (let index = 1; index < 3; index += 1) {
    if (
      getMatrix3Value(matrix, index, index) <
      getMatrix3Value(matrix, smallestEigenValueIndex, smallestEigenValueIndex)
    ) {
      smallestEigenValueIndex = index;
    }
  }

  return normalizeDirection(
    new Vector3(
      getMatrix3Value(eigenvectors, 0, smallestEigenValueIndex),
      getMatrix3Value(eigenvectors, 1, smallestEigenValueIndex),
      getMatrix3Value(eigenvectors, 2, smallestEigenValueIndex)
    )
  );
};

const computeBearingRadFromPlaneNormal = (
  plane: PlanarPolygonPlane
): number | undefined => {
  const normal = normalizeDirection(vector3FromMetricVector3(plane.normalECEF));
  if (!normal) return undefined;

  const anchor = vector3FromMetricVector3(plane.anchorECEF);
  const worldToEnuRotation = new ThreeMatrix3().setFromMatrix4(
    ecefToEnuMatrix(anchor)
  );

  const normalEnu = normal.clone().applyMatrix3(worldToEnuRotation);
  const east = normalEnu.x;
  const north = normalEnu.y;
  const horizontalMagnitude = Math.hypot(east, north);
  if (
    horizontalMagnitude <=
    planarGeometryDefaults.bearingHorizontalMagnitudeEpsilon
  ) {
    return undefined;
  }

  return zeroToTwoPi(Math.atan2(east, north) as Radians);
};

export const createPlaneFromThreePoints = (
  a: Vector3,
  b: Vector3,
  c: Vector3,
  preferredFacingPositionECEF?: Vector3 | null
): PlanarPolygonPlane | null => {
  const normalized = getNormalizedTriangleNormal(a, b, c);
  if (!normalized) return null;

  const plane: PlanarPolygonPlane = {
    anchorECEF: metricVector3FromVector3(a),
    normalECEF: metricVector3FromVector3(normalized),
  };
  return orientPlaneNormalTowardPosition(plane, preferredFacingPositionECEF);
};

export const createPlaneFromFirstNonCollinearPoints = (
  vertices: readonly Vector3[],
  preferredFacingPositionECEF?: Vector3 | null
): PlanarPolygonPlane | null => {
  const triangle = findFirstNonCollinearTriangleVertices(vertices);
  return triangle
    ? createPlaneFromThreePoints(
        triangle[0],
        triangle[1],
        triangle[2],
        preferredFacingPositionECEF
      )
    : null;
};

export const createPlaneFromLargestTriangle = (
  vertices: readonly Vector3[],
  preferredFacingPositionECEF?: Vector3 | null
): PlanarPolygonPlane | null => {
  const triangle = findLargestConsecutiveTriangleVertices(vertices);
  return triangle
    ? createPlaneFromThreePoints(
        triangle[0],
        triangle[1],
        triangle[2],
        preferredFacingPositionECEF
      )
    : null;
};

export const orientPlaneNormalTowardPosition = (
  plane: PlanarPolygonPlane,
  referencePositionECEF?: Vector3 | null
): PlanarPolygonPlane => {
  if (!referencePositionECEF) return plane;

  const anchor = vector3FromMetricVector3(plane.anchorECEF);
  const normal = normalizeDirection(vector3FromMetricVector3(plane.normalECEF));
  if (!normal) return plane;

  const toReference = new Vector3().subVectors(referencePositionECEF, anchor);
  if (
    toReference.lengthSq() <=
    planarGeometryDefaults.cartesianMagnitudeSquaredEpsilon
  ) {
    return plane;
  }
  if (normal.dot(toReference) >= 0) return plane;

  const flippedNormal = normal.clone().multiplyScalar(-1);
  return {
    ...plane,
    normalECEF: metricVector3FromVector3(flippedNormal),
  };
};

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

  const anchor = vertices.reduce(
    (result, vertex) => result.add(vertex),
    new Vector3()
  );
  anchor.multiplyScalar(1 / vertices.length);

  const covariance: Matrix3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];

  vertices.forEach((vertex) => {
    const delta = new Vector3().subVectors(vertex, anchor);
    const values = [delta.x, delta.y, delta.z] as const;
    for (let rowIndex = 0; rowIndex < 3; rowIndex += 1) {
      for (let columnIndex = rowIndex; columnIndex < 3; columnIndex += 1) {
        const nextValue =
          getMatrix3Value(covariance, rowIndex, columnIndex) +
          (values[rowIndex] ?? 0) * (values[columnIndex] ?? 0);
        setMatrix3Value(covariance, rowIndex, columnIndex, nextValue);
        setMatrix3Value(covariance, columnIndex, rowIndex, nextValue);
      }
    }
  });

  const normal = resolveSmallestEigenVectorSymmetricMatrix3(covariance);
  if (!normal) {
    return null;
  }

  return orientPlaneNormalTowardPosition(
    {
      anchorECEF: metricVector3FromVector3(anchor),
      normalECEF: metricVector3FromVector3(normal),
    },
    preferredFacingPositionECEF
  );
};

export const projectPointOntoPlane = (
  point: Vector3,
  plane: PlanarPolygonPlane
): Vector3 => {
  const anchor = vector3FromMetricVector3(plane.anchorECEF);
  return projectVector3OntoPlane(
    point,
    anchor,
    vector3FromMetricVector3(plane.normalECEF)
  );
};

export const distancePointToPlane = (
  point: Vector3,
  plane: PlanarPolygonPlane
): number => {
  const anchor = vector3FromMetricVector3(plane.anchorECEF);
  return Math.abs(
    getSignedVector3DistanceToPlane(
      point,
      anchor,
      vector3FromMetricVector3(plane.normalECEF)
    )
  );
};

export const computePolylinePlanarAngleSumDeg = (
  points: Vector3[],
  plane: PlanarPolygonPlane
): number => {
  if (points.length < 4) return Number.POSITIVE_INFINITY;
  const normal = vector3FromMetricVector3(plane.normalECEF).normalize();

  let sumDeg = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    if (!prev || !current || !next) continue;

    const incoming = new Vector3().subVectors(current, prev);
    const outgoing = new Vector3().subVectors(next, current);

    const incomingOnPlane = removeVector3ComponentAlongAxis(incoming, normal);
    const outgoingOnPlane = removeVector3ComponentAlongAxis(outgoing, normal);

    if (
      incomingOnPlane.lengthSq() <=
        planarGeometryDefaults.cartesianMagnitudeSquaredEpsilon ||
      outgoingOnPlane.lengthSq() <=
        planarGeometryDefaults.cartesianMagnitudeSquaredEpsilon
    ) {
      continue;
    }

    const inNorm = incomingOnPlane.clone().normalize();
    const outNorm = outgoingOnPlane.clone().normalize();
    const dot = Math.max(-1, Math.min(1, inNorm.dot(outNorm)));
    const angleDeg = radToDegNumeric(Math.acos(dot) as Radians)!;
    if (Number.isFinite(angleDeg)) {
      sumDeg += angleDeg;
    }
  }
  return sumDeg;
};

const getPlaneBasisU = (
  vertices: Vector3[],
  anchor: Vector3,
  normal: Vector3
): Vector3 => {
  for (let index = 0; index < vertices.length - 1; index += 1) {
    const current = vertices[index];
    const next = vertices[index + 1];
    if (!current || !next) continue;

    const edge = new Vector3().subVectors(next, current);
    const edgeOnPlane = removeVector3ComponentAlongAxis(edge, normal);
    if (
      edgeOnPlane.lengthSq() >
      planarGeometryDefaults.cartesianMagnitudeSquaredEpsilon
    ) {
      return edgeOnPlane.normalize();
    }
  }

  const east = new Vector3();
  ecefToEnuMatrix(anchor)
    .invert()
    .extractBasis(east, new Vector3(), new Vector3());
  east.normalize();
  const eastOnPlane = removeVector3ComponentAlongAxis(east, normal);
  if (
    eastOnPlane.lengthSq() >
    planarGeometryDefaults.cartesianMagnitudeSquaredEpsilon
  ) {
    return eastOnPlane.normalize();
  }

  return new Vector3().crossVectors(normal, new Vector3(1, 0, 0)).normalize();
};

export const computePlanarPolygonArea = (
  vertices: Vector3[],
  plane: PlanarPolygonPlane
): number => {
  if (vertices.length < 3) return 0;
  const anchor = vector3FromMetricVector3(plane.anchorECEF);
  const normal = vector3FromMetricVector3(plane.normalECEF).normalize();
  const u = getPlaneBasisU(vertices, anchor, normal);
  const v = new Vector3().crossVectors(normal, u).normalize();

  const coords = vertices.map((vertex) => {
    const delta = new Vector3().subVectors(vertex, anchor);
    return {
      x: delta.dot(u),
      y: delta.dot(v),
    };
  });
  return getPolygonArea2d(coords);
};

export const computeVerticalityDeg = (plane: PlanarPolygonPlane): number => {
  const anchor = vector3FromMetricVector3(plane.anchorECEF);
  const normal = vector3FromMetricVector3(plane.normalECEF).normalize();
  const up = getEllipsoidalUpDirectionAtAnchor(anchor);
  const dot = Math.max(-1, Math.min(1, Math.abs(normal.dot(up))));
  return radToDegNumeric(Math.acos(dot) as Radians)!;
};

export const classifyPlanarPolygonType = (
  verticalityDeg: number
): AnnotationTypes["AREA_PLANAR"] | AnnotationTypes["AREA_VERTICAL"] =>
  verticalityDeg > planarGeometryDefaults.polygonTypeVerticalityThresholdDeg
    ? ANNOTATION_TYPES.AREA_VERTICAL
    : ANNOTATION_TYPES.AREA_PLANAR;

export const buildEdgeRelationIdsForPolygon = (
  nodeIds: string[],
  closed: boolean,
  getDistanceRelationId: (left: string, right: string) => string
): string[] => {
  if (nodeIds.length < 2) return [];
  const edgeIds: string[] = [];
  for (let index = 0; index < nodeIds.length - 1; index += 1) {
    const start = nodeIds[index];
    const end = nodeIds[index + 1];
    if (!start || !end) continue;
    edgeIds.push(getDistanceRelationId(start, end));
  }
  if (closed && nodeIds.length >= 3) {
    const first = nodeIds[0];
    const last = nodeIds[nodeIds.length - 1];
    if (first && last) {
      edgeIds.push(getDistanceRelationId(last, first));
    }
  }
  return edgeIds;
};

const derivePlaneFromVertices = (
  vertices: Vector3[],
  preferredFacingPositionECEF?: Vector3 | null
): PlanarPolygonPlane | null =>
  createPlaneFromFirstNonCollinearPoints(vertices, preferredFacingPositionECEF);

const deriveVerticalPolygonLocalFrame = (
  vertices: Vector3[],
  plane: PlanarPolygonPlane,
  previousFrame?: PlanarPolygonLocalFrame
): PlanarPolygonLocalFrame | undefined => {
  if (vertices.length === 0) return undefined;

  const origin = vertices[0] ?? vector3FromMetricVector3(plane.anchorECEF);
  let north = normalizeDirection(vector3FromMetricVector3(plane.normalECEF));
  if (!north) return undefined;

  if (previousFrame) {
    const previousNorth = normalizeDirection(
      vector3FromMetricVector3(previousFrame.northECEF)
    );
    if (previousNorth && north.dot(previousNorth) < 0) {
      north = north.clone().multiplyScalar(-1);
    }
  }

  const ellipsoidalUp = getEllipsoidalUpDirectionAtAnchor(origin);
  let upInPlane = ellipsoidalUp
    ? normalizeDirection(removeVector3ComponentAlongAxis(ellipsoidalUp, north))
    : null;

  let east = upInPlane
    ? normalizeDirection(new Vector3().crossVectors(north, upInPlane))
    : null;

  if (!east) {
    for (let index = 0; index < vertices.length - 1; index += 1) {
      const start = vertices[index];
      const end = vertices[index + 1];
      if (!start || !end) continue;
      const edge = new Vector3().subVectors(end, start);
      const inPlaneEdge = removeVector3ComponentAlongAxis(edge, north);
      east = normalizeDirection(inPlaneEdge);
      if (east) break;
    }
  }

  if (!east) {
    east = normalizeDirection(
      new Vector3().crossVectors(north, new Vector3(1, 0, 0))
    );
  }
  if (!east) {
    east = normalizeDirection(
      new Vector3().crossVectors(north, new Vector3(0, 1, 0))
    );
  }
  if (!east) {
    return undefined;
  }

  upInPlane = normalizeDirection(new Vector3().crossVectors(east, north));
  if (!upInPlane) return undefined;

  if (previousFrame) {
    const previousEast = normalizeDirection(
      vector3FromMetricVector3(previousFrame.eastECEF)
    );
    if (previousEast && east.dot(previousEast) < 0) {
      east = east.clone().multiplyScalar(-1);
      north = north.clone().multiplyScalar(-1);
    }
  }

  return {
    originECEF: metricVector3FromVector3(origin),
    eastECEF: metricVector3FromVector3(east),
    northECEF: metricVector3FromVector3(north),
    upECEF: metricVector3FromVector3(upInPlane),
  };
};

export const computePolygonGroupDerivedData = (
  group: NodeChainAnnotation,
  pointById: Map<string, Vector3>,
  options?: {
    preferredFacingPositionECEF?: Vector3 | null;
    previousDerivedGeometry?: DerivedNodeChainAnnotationGeometry | null;
  }
): DerivedNodeChainAnnotation => {
  const preferredFacingPositionECEF =
    options?.preferredFacingPositionECEF ?? null;
  const previousDerivedGeometry = options?.previousDerivedGeometry ?? null;
  const computePerimeterMeters = () => {
    if (vertices.length < 2) return 0;
    let perimeterMeters = 0;
    for (let index = 1; index < vertices.length; index += 1) {
      const start = vertices[index - 1];
      const end = vertices[index];
      if (!start || !end) continue;
      perimeterMeters += start.distanceTo(end);
    }
    if (group.closed && vertices.length >= 3) {
      const first = vertices[0];
      const last = vertices[vertices.length - 1];
      if (first && last) {
        perimeterMeters += last.distanceTo(first);
      }
    }
    return perimeterMeters;
  };

  const vertices = group.nodeIds
    .map((id) => pointById.get(id))
    .filter((value): value is Vector3 => Boolean(value));
  const perimeterMeters = computePerimeterMeters();
  if (vertices.length < 3) {
    return {
      ...group,
      perimeterMeters,
      areaSquareMeters: 0,
    };
  }

  const plane = derivePlaneFromVertices(vertices, preferredFacingPositionECEF);
  if (!plane) {
    return {
      ...group,
      perimeterMeters,
      areaSquareMeters: 0,
    };
  }

  // Area is meaningful for closed polygons and for preliminary plane-locked polygons.
  const canComputeArea = group.closed || group.planeLocked;
  const areaSquareMeters = canComputeArea
    ? computePlanarPolygonArea(vertices, plane)
    : 0;
  const verticalityDeg = computeVerticalityDeg(plane);
  const bearingRad = computeBearingRadFromPlaneNormal(plane);
  const planarPolygonLocalFrame =
    group.type === ANNOTATION_TYPES.AREA_VERTICAL
      ? deriveVerticalPolygonLocalFrame(
          vertices,
          plane,
          previousDerivedGeometry?.planarPolygonLocalFrame
        )
      : undefined;

  return {
    ...group,
    plane,
    planarPolygonLocalFrame,
    perimeterMeters,
    areaSquareMeters,
    verticalityDeg,
    bearingRad,
  };
};
