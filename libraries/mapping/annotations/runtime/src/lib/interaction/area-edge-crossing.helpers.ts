import { Vector3 } from "three";
import {
  clamp,
  createPlaneBasisFromNormal,
  doSegmentsIntersect2d,
  type Point2,
} from "@carma-commons/math";
import {
  WGS84_ELLIPSOID,
  ecefFromGeographicCoordinate,
  ecefToEnuOffset,
  getGeographicSurfaceDistance,
  interpolateGeographicCoordinate,
  vector3FromMetricVector3,
} from "@carma-geo/proj";
import {
  createPlaneFromFirstNonCollinearPoints,
  projectPointOntoPlane,
  type PlanarPolygonPlane,
} from "@carma-mapping/annotations/core";
import type { AnnotationGeographicCoordinate } from "../store";

export const AREA_EDGE_CROSSING_PROJECTION_MODES = {
  AREA_PLANE: "area-plane",
  GROUND_GEODESIC: "ground-geodesic",
} as const;

export type AreaEdgeCrossingProjectionMode =
  (typeof AREA_EDGE_CROSSING_PROJECTION_MODES)[keyof typeof AREA_EDGE_CROSSING_PROJECTION_MODES];

type ProjectedEdge2 = {
  points: readonly Point2[];
};

const GROUND_GEODESIC_MAX_RELATIVE_APPROXIMATION_ERROR = 0.001;
const GROUND_GEODESIC_MAX_SEGMENTS_PER_EDGE = 64;

export type HasActualAreaEdgeCrossingOptions = {
  coordinates: readonly AnnotationGeographicCoordinate[];
  firstCheckedEdgeIndex?: number;
  projectionMode?: AreaEdgeCrossingProjectionMode;
  epsilon?: number;
};

export type CanAppendAreaPointWithoutActualEdgeCrossingOptions = {
  previousCoordinates: readonly AnnotationGeographicCoordinate[];
  nextCoordinates: readonly AnnotationGeographicCoordinate[];
  projectionMode?: AreaEdgeCrossingProjectionMode;
  epsilon?: number;
};

const projectPositionsToPlane2d = (
  positions: readonly Vector3[],
  plane: PlanarPolygonPlane
): Point2[] => {
  const anchor = vector3FromMetricVector3(plane.anchorECEF);
  const { xAxis, yAxis } = createPlaneBasisFromNormal(
    vector3FromMetricVector3(plane.normalECEF)
  );

  return positions.map((position) => {
    const delta = new Vector3().subVectors(position, anchor);
    return { x: delta.dot(xAxis), y: delta.dot(yAxis) };
  });
};

const createEdgesFromProjectedPoints2d = (
  points: readonly Point2[]
): ProjectedEdge2[] =>
  points.slice(0, -1).map((point, index) => ({
    points: [point, points[index + 1]!],
  }));

const projectPositionsToGroundTangent2d = (
  positions: readonly Vector3[],
  tangentPlaneAnchor: Vector3
): Point2[] =>
  positions.map((position) => {
    const { east, north } = ecefToEnuOffset(position, tangentPlaneAnchor);
    return { x: east, y: north };
  });

const resolveGroundGeodesicSegmentCount = (
  startCoordinate: AnnotationGeographicCoordinate,
  endCoordinate: AnnotationGeographicCoordinate
): number => {
  const surfaceDistance = getGeographicSurfaceDistance(
    startCoordinate,
    endCoordinate
  );
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
    8 * WGS84_ELLIPSOID.semiMajorAxis * maxApproximationError
  );
  if (!Number.isFinite(maxSegmentLength) || maxSegmentLength <= 0) {
    return 1;
  }

  return clamp(
    Math.ceil(surfaceDistance / maxSegmentLength),
    1,
    GROUND_GEODESIC_MAX_SEGMENTS_PER_EDGE
  );
};

const createGroundGeodesicEdgePositions = (
  startCoordinate: AnnotationGeographicCoordinate,
  endCoordinate: AnnotationGeographicCoordinate
): Vector3[] => {
  const startPosition = ecefFromGeographicCoordinate(startCoordinate);
  const endPosition = ecefFromGeographicCoordinate(endCoordinate);

  try {
    const segmentCount = resolveGroundGeodesicSegmentCount(
      startCoordinate,
      endCoordinate
    );

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
      return ecefFromGeographicCoordinate(
        interpolateGeographicCoordinate(
          startCoordinate,
          endCoordinate,
          fraction
        )
      );
    });
  } catch {
    return [startPosition, endPosition];
  }
};

const resolveGroundGeodesicProjectedEdges2d = (
  coordinates: readonly AnnotationGeographicCoordinate[]
): ProjectedEdge2[] | null => {
  const anchor = coordinates[0];
  if (!anchor) {
    return null;
  }

  const tangentPlaneAnchor = ecefFromGeographicCoordinate(anchor);

  return coordinates.slice(0, -1).map((coordinate, index) => ({
    points: projectPositionsToGroundTangent2d(
      createGroundGeodesicEdgePositions(coordinate, coordinates[index + 1]!),
      tangentPlaneAnchor
    ),
  }));
};

const resolveAreaEdgeCrossingEdges2d = ({
  coordinates,
  projectionMode,
}: {
  coordinates: readonly AnnotationGeographicCoordinate[];
  projectionMode: AreaEdgeCrossingProjectionMode;
}): ProjectedEdge2[] | null => {
  if (projectionMode === AREA_EDGE_CROSSING_PROJECTION_MODES.GROUND_GEODESIC) {
    return resolveGroundGeodesicProjectedEdges2d(coordinates);
  }

  const positions = coordinates.map((coordinate) =>
    ecefFromGeographicCoordinate(coordinate)
  );
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
        doSegmentsIntersect2d(
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
  const checkedStart = clamp(firstCheckedEdgeIndex, 0, edgeCount);

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
