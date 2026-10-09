import { Vector3 } from "three";
import { radToDegNumeric } from "@carma-units";
import {
  computePlanarPolygonArea,
  createBestFitPlanePca,
  createPlaneFromFirstNonCollinearPoints,
  createPlaneFromLargestTriangle,
  ecefFromGeographicCoordinate,
  geographicCoordinateFromEcef,
  projectPointOntoPlane,
  vector3FromMetricVector3,
  type AnnotationGeographicCoordinate,
  type PlanarPolygonPlane,
} from "@carma-mapping/annotations/core";
import { canAppendAreaPointWithoutActualEdgeCrossing } from "@carma-mapping/annotations/runtime";
import {
  hasPolygonSelfIntersection2d,
  hasPolylineRetracedSegment2d,
  type Point2,
} from "@carma-commons/math";

export const AREA_PLANAR_PROJECTION_MODES = {
  FIRST_NON_COLLINEAR_TRIANGLE: "first-non-collinear-triangle",
  BIGGEST_TRIANGLE: "biggest-triangle",
  PCA: "pca",
} as const;

export type AreaPlanarProjectionMode =
  (typeof AREA_PLANAR_PROJECTION_MODES)[keyof typeof AREA_PLANAR_PROJECTION_MODES];

const MIN_PROJECTED_AREA_SQUARE_METERS = 0.01;
export const AREA_PLANAR_DEFAULT_MAX_PLANE_NORMAL_CHANGE_DEG = 5;

export type AreaPlanarProjectionResult = {
  plane: PlanarPolygonPlane;
  projectedCoordinates: readonly AnnotationGeographicCoordinate[];
};

export type AreaPlanarProjectedAppendPreview = {
  lineCoordinates: readonly AnnotationGeographicCoordinate[];
  fillCoordinates: readonly AnnotationGeographicCoordinate[] | null;
  fillCoordinateRings?: readonly (readonly AnnotationGeographicCoordinate[])[];
};

type AreaPlanarProjectionPrefixResult = {
  prefixLength: number;
  projectionResult: AreaPlanarProjectionResult;
};

const resolveAreaPlanarProjectionPlane = ({
  positions,
  mode,
  preferredFacingPositionECEF,
}: {
  positions: readonly Vector3[];
  mode: AreaPlanarProjectionMode;
  preferredFacingPositionECEF?: Vector3 | null;
}): PlanarPolygonPlane | null => {
  if (mode === AREA_PLANAR_PROJECTION_MODES.BIGGEST_TRIANGLE) {
    return createPlaneFromLargestTriangle(
      positions,
      preferredFacingPositionECEF
    );
  }

  if (mode === AREA_PLANAR_PROJECTION_MODES.PCA) {
    return createBestFitPlanePca(positions, preferredFacingPositionECEF);
  }

  return createPlaneFromFirstNonCollinearPoints(
    positions,
    preferredFacingPositionECEF
  );
};

const isProjectedPolygonValidOnPlane = (
  projectedPositions: readonly Vector3[],
  activePlane: PlanarPolygonPlane
): boolean => {
  const points = projectPositionsToPlane2d(projectedPositions, activePlane);
  return (
    computePlanarPolygonArea([...projectedPositions], activePlane) >
      MIN_PROJECTED_AREA_SQUARE_METERS &&
    !hasPolygonSelfIntersection2d({
      points,
    }) &&
    !hasPolylineRetracedSegment2d({
      points: [...points, points[0]!],
    })
  );
};

const projectPositionsToPlane2d = (
  projectedPositions: readonly Vector3[],
  activePlane: PlanarPolygonPlane
): Point2[] => {
  const anchor = vector3FromMetricVector3(activePlane.anchorECEF);
  const normal = vector3FromMetricVector3(activePlane.normalECEF).normalize();
  const referenceAxis =
    Math.abs(normal.dot(new Vector3(1, 0, 0))) < 0.9
      ? new Vector3(1, 0, 0)
      : new Vector3(0, 1, 0);
  const u = new Vector3().crossVectors(referenceAxis, normal).normalize();
  const v = new Vector3().crossVectors(normal, u).normalize();

  return projectedPositions.map((position) => {
    const delta = new Vector3().subVectors(position, anchor);
    return {
      x: delta.dot(u),
      y: delta.dot(v),
    };
  });
};

export const resolveAreaPlanarProjectedCoordinates = ({
  coordinates,
  mode,
  preferredFacingPositionECEF,
}: {
  coordinates: readonly AnnotationGeographicCoordinate[];
  mode: AreaPlanarProjectionMode;
  preferredFacingPositionECEF?: Vector3 | null;
}): readonly AnnotationGeographicCoordinate[] | null =>
  resolveAreaPlanarProjectionResult({
    coordinates,
    mode,
    preferredFacingPositionECEF,
  })?.projectedCoordinates ?? null;

export const resolveAreaPlanarProjectionResult = ({
  coordinates,
  mode,
  preferredFacingPositionECEF,
}: {
  coordinates: readonly AnnotationGeographicCoordinate[];
  mode: AreaPlanarProjectionMode;
  preferredFacingPositionECEF?: Vector3 | null;
}): AreaPlanarProjectionResult | null => {
  if (coordinates.length < 3) {
    return null;
  }

  const positions = coordinates.map((coordinate) =>
    ecefFromGeographicCoordinate(coordinate)
  );
  const plane = resolveAreaPlanarProjectionPlane({
    positions,
    mode,
    preferredFacingPositionECEF,
  });
  if (!plane) {
    return null;
  }

  const projectedPositions = positions.map((position) =>
    projectPointOntoPlane(position, plane)
  );
  if (!isProjectedPolygonValidOnPlane(projectedPositions, plane)) {
    return null;
  }

  return {
    plane,
    projectedCoordinates: projectedPositions.map(geographicCoordinateFromEcef),
  };
};

const resolveLastValidAreaPlanarProjectionPrefixResult = ({
  coordinates,
  mode,
  preferredFacingPositionECEF,
}: {
  coordinates: readonly AnnotationGeographicCoordinate[];
  mode: AreaPlanarProjectionMode;
  preferredFacingPositionECEF?: Vector3 | null;
}): AreaPlanarProjectionPrefixResult | null => {
  for (
    let prefixLength = coordinates.length;
    prefixLength >= 3;
    prefixLength -= 1
  ) {
    const result = resolveAreaPlanarProjectionResult({
      coordinates: coordinates.slice(0, prefixLength),
      mode,
      preferredFacingPositionECEF,
    });
    if (result) {
      return {
        prefixLength,
        projectionResult: result,
      };
    }
  }

  return null;
};

const resolvePlaneNormalChangeDeg = (
  previousPlane: PlanarPolygonPlane,
  nextPlane: PlanarPolygonPlane
): number | null => {
  const previousNormal = vector3FromMetricVector3(
    previousPlane.normalECEF
  ).normalize();
  const nextNormal = vector3FromMetricVector3(nextPlane.normalECEF).normalize();
  const dot = Math.min(
    1,
    Math.max(-1, Math.abs(previousNormal.dot(nextNormal)))
  );
  const angleDeg = radToDegNumeric(Math.acos(dot));
  return Number.isFinite(angleDeg) ? angleDeg : null;
};

export const canResolveAreaPlanarProjectedPolygon = ({
  coordinates,
  mode,
  preferredFacingPositionECEF,
  previousCoordinates,
  maxPlaneNormalChangeDeg = AREA_PLANAR_DEFAULT_MAX_PLANE_NORMAL_CHANGE_DEG,
}: {
  coordinates: readonly AnnotationGeographicCoordinate[];
  mode: AreaPlanarProjectionMode;
  preferredFacingPositionECEF?: Vector3 | null;
  previousCoordinates?: readonly AnnotationGeographicCoordinate[];
  maxPlaneNormalChangeDeg?: number | null;
}): boolean =>
  coordinates.length < 3 ||
  (() => {
    const previousResult =
      previousCoordinates && previousCoordinates.length >= 3
        ? resolveAreaPlanarProjectionResult({
            coordinates: previousCoordinates,
            mode,
            preferredFacingPositionECEF,
          })
        : null;
    if (previousResult) {
      const positionsProjectedOnActivePlane = coordinates
        .map((coordinate) => ecefFromGeographicCoordinate(coordinate))
        .map((position) =>
          projectPointOntoPlane(position, previousResult.plane)
        );
      if (
        !isProjectedPolygonValidOnPlane(
          positionsProjectedOnActivePlane,
          previousResult.plane
        )
      ) {
        return false;
      }
    }

    const nextResult = resolveAreaPlanarProjectionResult({
      coordinates,
      mode,
      preferredFacingPositionECEF,
    });
    if (!nextResult) {
      return false;
    }

    if (
      !previousCoordinates ||
      previousCoordinates.length < 3 ||
      maxPlaneNormalChangeDeg === null
    ) {
      return true;
    }

    if (!previousResult) {
      return true;
    }

    const normalChangeDeg = resolvePlaneNormalChangeDeg(
      previousResult.plane,
      nextResult.plane
    );
    return (
      normalChangeDeg === null || normalChangeDeg <= maxPlaneNormalChangeDeg
    );
  })();

export const canAppendAreaPlanarProjectedPoint = ({
  coordinates,
  mode,
  preferredFacingPositionECEF,
  previousCoordinates,
  maxPlaneNormalChangeDeg = AREA_PLANAR_DEFAULT_MAX_PLANE_NORMAL_CHANGE_DEG,
}: {
  coordinates: readonly AnnotationGeographicCoordinate[];
  mode: AreaPlanarProjectionMode;
  preferredFacingPositionECEF?: Vector3 | null;
  previousCoordinates?: readonly AnnotationGeographicCoordinate[];
  maxPlaneNormalChangeDeg?: number | null;
}): boolean => {
  if (
    !previousCoordinates ||
    previousCoordinates.length < 3 ||
    coordinates.length !== previousCoordinates.length + 1
  ) {
    return canResolveAreaPlanarProjectedPolygon({
      coordinates,
      mode,
      preferredFacingPositionECEF,
      previousCoordinates,
      maxPlaneNormalChangeDeg,
    });
  }

  const previousPrefixResult = resolveLastValidAreaPlanarProjectionPrefixResult(
    {
      coordinates: previousCoordinates,
      mode,
      preferredFacingPositionECEF,
    }
  );
  if (!previousPrefixResult) {
    return false;
  }
  const previousResult = previousPrefixResult.projectionResult;

  const projectedOnPreviousPlane = coordinates
    .map((coordinate) => ecefFromGeographicCoordinate(coordinate))
    .map((position) => projectPointOntoPlane(position, previousResult.plane));
  const projectedPreviousCoordinates = previousCoordinates.map((coordinate) =>
    geographicCoordinateFromEcef(
      projectPointOntoPlane(
        ecefFromGeographicCoordinate(coordinate),
        previousResult.plane
      )
    )
  );
  const projectedCoordinates = projectedOnPreviousPlane.map(
    geographicCoordinateFromEcef
  );
  if (
    !canAppendAreaPointWithoutActualEdgeCrossing({
      previousCoordinates: projectedPreviousCoordinates,
      nextCoordinates: projectedCoordinates,
    })
  ) {
    return false;
  }

  if (
    hasPolylineRetracedSegment2d({
      points: projectPositionsToPlane2d(
        projectedOnPreviousPlane,
        previousResult.plane
      ),
    })
  ) {
    return false;
  }

  if (maxPlaneNormalChangeDeg === null) {
    return true;
  }

  const nextPlane = resolveAreaPlanarProjectionPlane({
    positions: coordinates.map((coordinate) =>
      ecefFromGeographicCoordinate(coordinate)
    ),
    mode,
    preferredFacingPositionECEF,
  });
  if (!nextPlane) {
    return false;
  }

  const normalChangeDeg = resolvePlaneNormalChangeDeg(
    previousResult.plane,
    nextPlane
  );
  return normalChangeDeg === null || normalChangeDeg <= maxPlaneNormalChangeDeg;
};

export const resolveAreaPlanarProjectedAppendPreview = ({
  coordinates,
  mode,
  preferredFacingPositionECEF,
  previousCoordinates,
  maxPlaneNormalChangeDeg = AREA_PLANAR_DEFAULT_MAX_PLANE_NORMAL_CHANGE_DEG,
}: {
  coordinates: readonly AnnotationGeographicCoordinate[];
  mode: AreaPlanarProjectionMode;
  preferredFacingPositionECEF?: Vector3 | null;
  previousCoordinates?: readonly AnnotationGeographicCoordinate[];
  maxPlaneNormalChangeDeg?: number | null;
}): AreaPlanarProjectedAppendPreview | null => {
  const isAppendingOnePoint =
    !!previousCoordinates &&
    previousCoordinates.length >= 3 &&
    coordinates.length === previousCoordinates.length + 1;
  if (
    isAppendingOnePoint &&
    !canAppendAreaPlanarProjectedPoint({
      coordinates,
      mode,
      preferredFacingPositionECEF,
      previousCoordinates,
      maxPlaneNormalChangeDeg,
    })
  ) {
    return null;
  }

  const fullProjectedCoordinates = resolveAreaPlanarProjectedCoordinates({
    coordinates,
    mode,
    preferredFacingPositionECEF,
  });
  if (fullProjectedCoordinates) {
    return {
      lineCoordinates: fullProjectedCoordinates,
      fillCoordinates: fullProjectedCoordinates,
      fillCoordinateRings: [fullProjectedCoordinates],
    };
  }

  if (coordinates.length < 4) {
    return null;
  }

  const fillPrefixResult = resolveLastValidAreaPlanarProjectionPrefixResult({
    coordinates: coordinates.slice(0, -1),
    mode,
    preferredFacingPositionECEF,
  });
  if (!fillPrefixResult) {
    return null;
  }
  const fillResult = fillPrefixResult.projectionResult;

  const projectedLinePositions = coordinates
    .map((coordinate) => ecefFromGeographicCoordinate(coordinate))
    .map((position) => projectPointOntoPlane(position, fillResult.plane));
  if (
    hasPolylineRetracedSegment2d({
      points: projectPositionsToPlane2d(
        projectedLinePositions,
        fillResult.plane
      ),
    })
  ) {
    return null;
  }

  const tailPositions = projectedLinePositions.slice(
    fillPrefixResult.prefixLength - 1
  );
  const tailCoordinates =
    tailPositions.length >= 3 &&
    isProjectedPolygonValidOnPlane(tailPositions, fillResult.plane)
      ? tailPositions.map(geographicCoordinateFromEcef)
      : null;
  const fillCoordinateRings = tailCoordinates
    ? [fillResult.projectedCoordinates, tailCoordinates]
    : [fillResult.projectedCoordinates];

  return {
    lineCoordinates: projectedLinePositions.map(geographicCoordinateFromEcef),
    fillCoordinates: fillResult.projectedCoordinates,
    fillCoordinateRings,
  };
};
