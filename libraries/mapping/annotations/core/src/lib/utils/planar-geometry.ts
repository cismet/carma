import { getPolygonArea2d } from "@carma-commons/math";
import {
  Cartesian3,
  Cartesian4,
  Matrix4,
  Transforms,
  Ellipsoid,
} from "@carma-cesium";
import { radToDegNumeric, type Radians, zeroToTwoPi } from "@carma-units";
import {
  cartesian3FromMetricVector3,
  cartesian3ToMetricVector3,
  getEllipsoidalUpDirectionAtAnchor,
  getNormalizedCartesian3TriangleNormal,
  getSignedCartesian3DistanceToPlane,
  matrix4ColumnToCartesian3,
  normalizeDirection,
  projectCartesian3PointOntoPlane,
  removeCartesian3ComponentAlongAxis,
} from "@carma-mapping/engines/cesium/core";

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

const computeBearingRadFromPlaneNormal = (
  plane: PlanarPolygonPlane
): number | undefined => {
  const normal = normalizeDirection(
    cartesian3FromMetricVector3(plane.normalECEF)
  );
  if (!normal) return undefined;

  const anchor = cartesian3FromMetricVector3(plane.anchorECEF);
  const enuFrame = Transforms.eastNorthUpToFixedFrame(anchor, Ellipsoid.WGS84);
  const worldToEnu = Matrix4.inverse(enuFrame, new Matrix4());

  const normalEnu4 = Matrix4.multiplyByVector(
    worldToEnu,
    new Cartesian4(normal.x, normal.y, normal.z, 0),
    new Cartesian4()
  );
  const east = normalEnu4.x;
  const north = normalEnu4.y;
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
  a: Cartesian3,
  b: Cartesian3,
  c: Cartesian3,
  preferredFacingPositionECEF?: Cartesian3 | null
): PlanarPolygonPlane | null => {
  const normalized = getNormalizedCartesian3TriangleNormal(a, b, c);
  if (!normalized) return null;

  const plane: PlanarPolygonPlane = {
    anchorECEF: cartesian3ToMetricVector3(a),
    normalECEF: cartesian3ToMetricVector3(normalized),
  };
  return orientPlaneNormalTowardPosition(plane, preferredFacingPositionECEF);
};

export const orientPlaneNormalTowardPosition = (
  plane: PlanarPolygonPlane,
  referencePositionECEF?: Cartesian3 | null
): PlanarPolygonPlane => {
  if (!referencePositionECEF) return plane;

  const anchor = cartesian3FromMetricVector3(plane.anchorECEF);
  const normal = normalizeDirection(
    cartesian3FromMetricVector3(plane.normalECEF)
  );
  if (!normal) return plane;

  const toReference = Cartesian3.subtract(
    referencePositionECEF,
    anchor,
    new Cartesian3()
  );
  if (
    Cartesian3.magnitudeSquared(toReference) <=
    planarGeometryDefaults.cartesianMagnitudeSquaredEpsilon
  ) {
    return plane;
  }
  if (Cartesian3.dot(normal, toReference) >= 0) return plane;

  const flippedNormal = Cartesian3.multiplyByScalar(
    normal,
    -1,
    new Cartesian3()
  );
  return {
    ...plane,
    normalECEF: cartesian3ToMetricVector3(flippedNormal),
  };
};

export const projectPointOntoPlane = (
  point: Cartesian3,
  plane: PlanarPolygonPlane
): Cartesian3 => {
  const anchor = cartesian3FromMetricVector3(plane.anchorECEF);
  return projectCartesian3PointOntoPlane(
    point,
    anchor,
    cartesian3FromMetricVector3(plane.normalECEF)
  );
};

export const distancePointToPlane = (
  point: Cartesian3,
  plane: PlanarPolygonPlane
): number => {
  const anchor = cartesian3FromMetricVector3(plane.anchorECEF);
  return Math.abs(
    getSignedCartesian3DistanceToPlane(
      point,
      anchor,
      cartesian3FromMetricVector3(plane.normalECEF)
    )
  );
};

export const computePolylinePlanarAngleSumDeg = (
  points: Cartesian3[],
  plane: PlanarPolygonPlane
): number => {
  if (points.length < 4) return Number.POSITIVE_INFINITY;
  const normal = Cartesian3.normalize(
    cartesian3FromMetricVector3(plane.normalECEF),
    new Cartesian3()
  );

  let sumDeg = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    if (!prev || !current || !next) continue;

    const incoming = Cartesian3.subtract(current, prev, new Cartesian3());
    const outgoing = Cartesian3.subtract(next, current, new Cartesian3());

    const incomingOnPlane = removeCartesian3ComponentAlongAxis(
      incoming,
      normal
    );
    const outgoingOnPlane = removeCartesian3ComponentAlongAxis(
      outgoing,
      normal
    );

    if (
      Cartesian3.magnitudeSquared(incomingOnPlane) <=
        planarGeometryDefaults.cartesianMagnitudeSquaredEpsilon ||
      Cartesian3.magnitudeSquared(outgoingOnPlane) <=
        planarGeometryDefaults.cartesianMagnitudeSquaredEpsilon
    ) {
      continue;
    }

    const inNorm = Cartesian3.normalize(incomingOnPlane, new Cartesian3());
    const outNorm = Cartesian3.normalize(outgoingOnPlane, new Cartesian3());
    const dot = Math.max(-1, Math.min(1, Cartesian3.dot(inNorm, outNorm)));
    const angleDeg = radToDegNumeric(Math.acos(dot) as Radians)!;
    if (Number.isFinite(angleDeg)) {
      sumDeg += angleDeg;
    }
  }
  return sumDeg;
};

const getPlaneBasisU = (
  vertices: Cartesian3[],
  anchor: Cartesian3,
  normal: Cartesian3
): Cartesian3 => {
  for (let index = 0; index < vertices.length - 1; index += 1) {
    const current = vertices[index];
    const next = vertices[index + 1];
    if (!current || !next) continue;

    const edge = Cartesian3.subtract(next, current, new Cartesian3());
    const edgeOnPlane = removeCartesian3ComponentAlongAxis(edge, normal);
    if (
      Cartesian3.magnitudeSquared(edgeOnPlane) >
      planarGeometryDefaults.cartesianMagnitudeSquaredEpsilon
    ) {
      return Cartesian3.normalize(edgeOnPlane, new Cartesian3());
    }
  }

  const upMatrix = Transforms.eastNorthUpToFixedFrame(anchor, Ellipsoid.WGS84);
  const east = Cartesian3.normalize(
    matrix4ColumnToCartesian3(upMatrix, 0, new Cartesian3()),
    new Cartesian3()
  );
  const eastOnPlane = removeCartesian3ComponentAlongAxis(east, normal);
  if (
    Cartesian3.magnitudeSquared(eastOnPlane) >
    planarGeometryDefaults.cartesianMagnitudeSquaredEpsilon
  ) {
    return Cartesian3.normalize(eastOnPlane, new Cartesian3());
  }

  return Cartesian3.normalize(
    Cartesian3.cross(normal, Cartesian3.UNIT_X, new Cartesian3()),
    new Cartesian3()
  );
};

export const computePlanarPolygonArea = (
  vertices: Cartesian3[],
  plane: PlanarPolygonPlane
): number => {
  if (vertices.length < 3) return 0;
  const anchor = cartesian3FromMetricVector3(plane.anchorECEF);
  const normal = Cartesian3.normalize(
    cartesian3FromMetricVector3(plane.normalECEF),
    new Cartesian3()
  );
  const u = getPlaneBasisU(vertices, anchor, normal);
  const v = Cartesian3.normalize(
    Cartesian3.cross(normal, u, new Cartesian3()),
    new Cartesian3()
  );

  const coords = vertices.map((vertex) => {
    const delta = Cartesian3.subtract(vertex, anchor, new Cartesian3());
    return {
      x: Cartesian3.dot(delta, u),
      y: Cartesian3.dot(delta, v),
    };
  });
  return getPolygonArea2d(coords);
};

export const computeVerticalityDeg = (plane: PlanarPolygonPlane): number => {
  const anchor = cartesian3FromMetricVector3(plane.anchorECEF);
  const normal = Cartesian3.normalize(
    cartesian3FromMetricVector3(plane.normalECEF),
    new Cartesian3()
  );
  const up = getEllipsoidalUpDirectionAtAnchor(anchor);
  const dot = Math.max(-1, Math.min(1, Math.abs(Cartesian3.dot(normal, up))));
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
  vertices: Cartesian3[],
  preferredFacingPositionECEF?: Cartesian3 | null
): PlanarPolygonPlane | null => {
  if (vertices.length < 3) return null;

  for (let i = 0; i < vertices.length - 2; i += 1) {
    for (let j = i + 1; j < vertices.length - 1; j += 1) {
      for (let k = j + 1; k < vertices.length; k += 1) {
        const a = vertices[i];
        const b = vertices[j];
        const c = vertices[k];
        if (!a || !b || !c) continue;
        const plane = createPlaneFromThreePoints(
          a,
          b,
          c,
          preferredFacingPositionECEF
        );
        if (plane) return plane;
      }
    }
  }

  return null;
};

const deriveVerticalPolygonLocalFrame = (
  vertices: Cartesian3[],
  plane: PlanarPolygonPlane,
  previousFrame?: PlanarPolygonLocalFrame
): PlanarPolygonLocalFrame | undefined => {
  if (vertices.length === 0) return undefined;

  const origin = vertices[0] ?? cartesian3FromMetricVector3(plane.anchorECEF);
  let north = normalizeDirection(cartesian3FromMetricVector3(plane.normalECEF));
  if (!north) return undefined;

  if (previousFrame) {
    const previousNorth = normalizeDirection(
      cartesian3FromMetricVector3(previousFrame.northECEF)
    );
    if (previousNorth && Cartesian3.dot(north, previousNorth) < 0) {
      north = Cartesian3.multiplyByScalar(north, -1, new Cartesian3());
    }
  }

  const ellipsoidalUp = getEllipsoidalUpDirectionAtAnchor(origin);
  let upInPlane = ellipsoidalUp
    ? normalizeDirection(
        removeCartesian3ComponentAlongAxis(ellipsoidalUp, north)
      )
    : null;

  let east = upInPlane
    ? normalizeDirection(Cartesian3.cross(north, upInPlane, new Cartesian3()))
    : null;

  if (!east) {
    for (let index = 0; index < vertices.length - 1; index += 1) {
      const start = vertices[index];
      const end = vertices[index + 1];
      if (!start || !end) continue;
      const edge = Cartesian3.subtract(end, start, new Cartesian3());
      const inPlaneEdge = removeCartesian3ComponentAlongAxis(edge, north);
      east = normalizeDirection(inPlaneEdge);
      if (east) break;
    }
  }

  if (!east) {
    east = normalizeDirection(
      Cartesian3.cross(north, Cartesian3.UNIT_X, new Cartesian3())
    );
  }
  if (!east) {
    east = normalizeDirection(
      Cartesian3.cross(north, Cartesian3.UNIT_Y, new Cartesian3())
    );
  }
  if (!east) {
    return undefined;
  }

  upInPlane = normalizeDirection(
    Cartesian3.cross(east, north, new Cartesian3())
  );
  if (!upInPlane) return undefined;

  if (previousFrame) {
    const previousEast = normalizeDirection(
      cartesian3FromMetricVector3(previousFrame.eastECEF)
    );
    if (previousEast && Cartesian3.dot(east, previousEast) < 0) {
      east = Cartesian3.multiplyByScalar(east, -1, new Cartesian3());
      north = Cartesian3.multiplyByScalar(north, -1, new Cartesian3());
    }
  }

  return {
    originECEF: cartesian3ToMetricVector3(origin),
    eastECEF: cartesian3ToMetricVector3(east),
    northECEF: cartesian3ToMetricVector3(north),
    upECEF: cartesian3ToMetricVector3(upInPlane),
  };
};

export const computePolygonGroupDerivedData = (
  group: NodeChainAnnotation,
  pointById: Map<string, Cartesian3>,
  options?: {
    preferredFacingPositionECEF?: Cartesian3 | null;
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
      perimeterMeters += Cartesian3.distance(start, end);
    }
    if (group.closed && vertices.length >= 3) {
      const first = vertices[0];
      const last = vertices[vertices.length - 1];
      if (first && last) {
        perimeterMeters += Cartesian3.distance(last, first);
      }
    }
    return perimeterMeters;
  };

  const vertices = group.nodeIds
    .map((id) => pointById.get(id))
    .filter((value): value is Cartesian3 => Boolean(value));
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
