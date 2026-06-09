import {
  Cartesian3,
  Cartographic,
  EllipsoidGeodesic,
  EllipsoidTangentPlane,
} from "@carma-cesium";
import {
  createPlaneFromFirstNonCollinearPoints,
  projectPointOntoPlane,
  type PlanarPolygonPlane,
} from "@carma-mapping/annotations/core";
import {
  cartesian3FromGeographicCoordinate,
  cartesian3FromMetricVector3,
} from "@carma-mapping/engines/cesium/core";
import type { CesiumGeographicCoordinate } from "../store";

export const AREA_EDGE_CROSSING_PROJECTION_MODES = {
  AREA_PLANE: "area-plane",
  GROUND_GEODESIC: "ground-geodesic",
} as const;

export type AreaEdgeCrossingProjectionMode =
  (typeof AREA_EDGE_CROSSING_PROJECTION_MODES)[keyof typeof AREA_EDGE_CROSSING_PROJECTION_MODES];

type Point2 = {
  x: number;
  y: number;
};

type ProjectedEdge2 = {
  points: readonly Point2[];
};

const GROUND_GEODESIC_MAX_RELATIVE_APPROXIMATION_ERROR = 0.001;
const GROUND_GEODESIC_MAX_SEGMENTS_PER_EDGE = 64;

export type HasActualAreaEdgeCrossingOptions = {
  coordinates: readonly CesiumGeographicCoordinate[];
  firstCheckedEdgeIndex?: number;
  projectionMode?: AreaEdgeCrossingProjectionMode;
  epsilon?: number;
};

export type CanAppendAreaPointWithoutActualEdgeCrossingOptions = {
  previousCoordinates: readonly CesiumGeographicCoordinate[];
  nextCoordinates: readonly CesiumGeographicCoordinate[];
  projectionMode?: AreaEdgeCrossingProjectionMode;
  epsilon?: number;
};

const projectPositionsToPlane2d = (
  positions: readonly Cartesian3[],
  plane: PlanarPolygonPlane
): Point2[] => {
  const anchor = cartesian3FromMetricVector3(plane.anchorECEF);
  const normal = Cartesian3.normalize(
    cartesian3FromMetricVector3(plane.normalECEF),
    new Cartesian3()
  );
  const referenceAxis =
    Math.abs(Cartesian3.dot(normal, Cartesian3.UNIT_X)) < 0.9
      ? Cartesian3.UNIT_X
      : Cartesian3.UNIT_Y;
  const u = Cartesian3.normalize(
    Cartesian3.cross(referenceAxis, normal, new Cartesian3()),
    new Cartesian3()
  );
  const v = Cartesian3.normalize(
    Cartesian3.cross(normal, u, new Cartesian3()),
    new Cartesian3()
  );

  return positions.map((position) => {
    const delta = Cartesian3.subtract(position, anchor, new Cartesian3());
    return {
      x: Cartesian3.dot(delta, u),
      y: Cartesian3.dot(delta, v),
    };
  });
};

const createEdgesFromProjectedPoints2d = (
  points: readonly Point2[]
): ProjectedEdge2[] =>
  points.slice(0, -1).map((point, index) => ({
    points: [point, points[index + 1]!],
  }));

const projectPositionsToGroundTangent2d = (
  positions: readonly Cartesian3[],
  tangentPlane: EllipsoidTangentPlane
): Point2[] =>
  tangentPlane
    .projectPointsToNearestOnPlane([...positions])
    .map(({ x, y }) => ({ x, y }));

const createCartographicFromCoordinate = ({
  longitude,
  latitude,
  altitude,
}: CesiumGeographicCoordinate): Cartographic =>
  Cartographic.fromDegrees(longitude, latitude, altitude);

const resolveGroundGeodesicSegmentCount = (
  geodesic: EllipsoidGeodesic
): number => {
  const surfaceDistance = geodesic.surfaceDistance;
  const maxApproximationError =
    surfaceDistance * GROUND_GEODESIC_MAX_RELATIVE_APPROXIMATION_ERROR;
  if (
    !Number.isFinite(surfaceDistance) ||
    surfaceDistance <= 0 ||
    maxApproximationError <= 0
  ) {
    return 1;
  }

  const maxSegmentLength = Math.sqrt(
    8 * geodesic.ellipsoid.maximumRadius * maxApproximationError
  );
  if (!Number.isFinite(maxSegmentLength) || maxSegmentLength <= 0) {
    return 1;
  }

  return Math.max(
    1,
    Math.min(
      GROUND_GEODESIC_MAX_SEGMENTS_PER_EDGE,
      Math.ceil(surfaceDistance / maxSegmentLength)
    )
  );
};

const createGroundGeodesicEdgePositions = (
  startCoordinate: CesiumGeographicCoordinate,
  endCoordinate: CesiumGeographicCoordinate
): Cartesian3[] => {
  const startPosition = cartesian3FromGeographicCoordinate(startCoordinate);
  const endPosition = cartesian3FromGeographicCoordinate(endCoordinate);
  const start = createCartographicFromCoordinate(startCoordinate);
  const end = createCartographicFromCoordinate(endCoordinate);

  try {
    const geodesic = new EllipsoidGeodesic(start, end);
    const segmentCount = resolveGroundGeodesicSegmentCount(geodesic);

    if (segmentCount === 1) {
      return [startPosition, endPosition];
    }

    return Array.from({ length: segmentCount + 1 }, (_, index) => {
      if (index === 0) {
        return startPosition;
      }

      if (index === segmentCount) {
        return endPosition;
      }

      const fraction = index / segmentCount;
      const interpolated = geodesic.interpolateUsingFraction(fraction);
      const altitude =
        startCoordinate.altitude +
        (endCoordinate.altitude - startCoordinate.altitude) * fraction;

      return Cartesian3.fromRadians(
        interpolated.longitude,
        interpolated.latitude,
        altitude
      );
    });
  } catch {
    return [startPosition, endPosition];
  }
};

const resolveGroundGeodesicProjectedEdges2d = (
  coordinates: readonly CesiumGeographicCoordinate[]
): ProjectedEdge2[] | null => {
  const anchor = coordinates[0];
  if (!anchor) {
    return null;
  }

  const tangentPlane = new EllipsoidTangentPlane(
    cartesian3FromGeographicCoordinate(anchor)
  );

  return coordinates.slice(0, -1).map((coordinate, index) => ({
    points: projectPositionsToGroundTangent2d(
      createGroundGeodesicEdgePositions(coordinate, coordinates[index + 1]!),
      tangentPlane
    ),
  }));
};

const resolveAreaEdgeCrossingEdges2d = ({
  coordinates,
  projectionMode,
}: {
  coordinates: readonly CesiumGeographicCoordinate[];
  projectionMode: AreaEdgeCrossingProjectionMode;
}): ProjectedEdge2[] | null => {
  const positions = coordinates.map(cartesian3FromGeographicCoordinate);
  if (projectionMode === AREA_EDGE_CROSSING_PROJECTION_MODES.GROUND_GEODESIC) {
    return resolveGroundGeodesicProjectedEdges2d(coordinates);
  }

  const plane = createPlaneFromFirstNonCollinearPoints(positions);
  if (!plane) {
    return null;
  }

  return createEdgesFromProjectedPoints2d(
    projectPositionsToPlane2d(
      positions.map((position) => projectPointOntoPlane(position, plane)),
      plane
    )
  );
};

const getOrientation2d = (a: Point2, b: Point2, c: Point2): number =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

const isBetweenInclusive = (
  value: number,
  start: number,
  end: number,
  epsilon: number
): boolean =>
  value >= Math.min(start, end) - epsilon &&
  value <= Math.max(start, end) + epsilon;

const arePointsClose2d = (left: Point2, right: Point2, epsilon: number) =>
  Math.abs(left.x - right.x) <= epsilon &&
  Math.abs(left.y - right.y) <= epsilon;

const isPointOnSegment2d = (
  point: Point2,
  start: Point2,
  end: Point2,
  epsilon: number
): boolean =>
  Math.abs(getOrientation2d(start, end, point)) <= epsilon &&
  isBetweenInclusive(point.x, start.x, end.x, epsilon) &&
  isBetweenInclusive(point.y, start.y, end.y, epsilon);

const doCollinearSegmentsOverlapBeyondSinglePoint2d = (
  a: Point2,
  b: Point2,
  c: Point2,
  d: Point2,
  epsilon: number
): boolean => {
  const overlapPoints = [a, b, c, d].filter(
    (point) =>
      isPointOnSegment2d(point, a, b, epsilon) &&
      isPointOnSegment2d(point, c, d, epsilon)
  );

  return overlapPoints.some((point, index) =>
    overlapPoints
      .slice(index + 1)
      .some((otherPoint) => !arePointsClose2d(point, otherPoint, epsilon))
  );
};

const doSegmentsCrossOrOverlap2d = (
  a: Point2,
  b: Point2,
  c: Point2,
  d: Point2,
  epsilon: number
): boolean => {
  const abC = getOrientation2d(a, b, c);
  const abD = getOrientation2d(a, b, d);
  const cdA = getOrientation2d(c, d, a);
  const cdB = getOrientation2d(c, d, b);

  if (
    ((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon)) &&
    ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon))
  ) {
    return true;
  }

  if (
    Math.abs(abC) <= epsilon &&
    Math.abs(abD) <= epsilon &&
    Math.abs(cdA) <= epsilon &&
    Math.abs(cdB) <= epsilon
  ) {
    return doCollinearSegmentsOverlapBeyondSinglePoint2d(a, b, c, d, epsilon);
  }

  return false;
};

const doPolylinesCrossOrOverlap2d = (
  first: readonly Point2[],
  second: readonly Point2[],
  epsilon: number
): boolean => {
  for (let firstIndex = 0; firstIndex < first.length - 1; firstIndex += 1) {
    for (
      let secondIndex = 0;
      secondIndex < second.length - 1;
      secondIndex += 1
    ) {
      if (
        doSegmentsCrossOrOverlap2d(
          first[firstIndex]!,
          first[firstIndex + 1]!,
          second[secondIndex]!,
          second[secondIndex + 1]!,
          epsilon
        )
      ) {
        return true;
      }
    }
  }

  return false;
};

export const hasActualAreaEdgeCrossing = ({
  coordinates,
  firstCheckedEdgeIndex = 0,
  projectionMode = AREA_EDGE_CROSSING_PROJECTION_MODES.AREA_PLANE,
  epsilon = 1e-7,
}: HasActualAreaEdgeCrossingOptions): boolean => {
  if (coordinates.length < 4) {
    return false;
  }

  const edges = resolveAreaEdgeCrossingEdges2d({
    coordinates,
    projectionMode,
  });
  if (!edges) {
    return false;
  }

  const edgeCount = edges.length;
  const checkedStart = Math.max(0, Math.min(firstCheckedEdgeIndex, edgeCount));

  for (
    let checkedEdgeIndex = checkedStart;
    checkedEdgeIndex < edgeCount;
    checkedEdgeIndex += 1
  ) {
    const checkedEdge = edges[checkedEdgeIndex]!;

    for (
      let existingEdgeIndex = 0;
      existingEdgeIndex < checkedEdgeIndex - 1;
      existingEdgeIndex += 1
    ) {
      if (
        doPolylinesCrossOrOverlap2d(
          edges[existingEdgeIndex]!.points,
          checkedEdge.points,
          epsilon
        )
      ) {
        return true;
      }
    }
  }

  return false;
};

export const canAppendAreaPointWithoutActualEdgeCrossing = ({
  previousCoordinates,
  nextCoordinates,
  projectionMode,
  epsilon,
}: CanAppendAreaPointWithoutActualEdgeCrossingOptions): boolean => {
  if (nextCoordinates.length <= previousCoordinates.length) {
    return true;
  }

  return !hasActualAreaEdgeCrossing({
    coordinates: nextCoordinates,
    firstCheckedEdgeIndex: Math.max(0, previousCoordinates.length - 1),
    projectionMode,
    epsilon,
  });
};
