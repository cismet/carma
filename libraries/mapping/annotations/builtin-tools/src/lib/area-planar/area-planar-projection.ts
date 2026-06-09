import {
  computePlanarPolygonArea,
  createBestFitPlanePca,
  createPlaneFromFirstNonCollinearPoints,
  createPlaneFromLargestTriangle,
  projectPointOntoPlane,
  type PlanarPolygonPlane,
} from "@carma-mapping/annotations/core";
import type { CesiumGeographicCoordinate } from "@carma-mapping/annotations/runtime";
import { canAppendAreaPointWithoutActualEdgeCrossing } from "@carma-mapping/annotations/runtime";
import { Cartesian3 } from "@carma-cesium";
import {
  hasPolygonSelfIntersection2d,
  hasPolylineRetracedSegment2d,
  type Point2,
} from "@carma-commons/math";
import {
  cartesian3FromMetricVector3,
  cartesian3FromGeographicCoordinate,
  geographicCoordinateFromCartesian3,
} from "@carma-mapping/engines/cesium/core";

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
  projectedCoordinates: readonly CesiumGeographicCoordinate[];
};

export type AreaPlanarProjectedAppendPreview = {
  lineCoordinates: readonly CesiumGeographicCoordinate[];
  fillCoordinates: readonly CesiumGeographicCoordinate[] | null;
  fillCoordinateRings?: readonly (readonly CesiumGeographicCoordinate[])[];
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
  positions: readonly Cartesian3[];
  mode: AreaPlanarProjectionMode;
  preferredFacingPositionECEF?: Cartesian3 | null;
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
  projectedPositions: readonly Cartesian3[],
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
  projectedPositions: readonly Cartesian3[],
  activePlane: PlanarPolygonPlane
): Point2[] => {
  const anchor = cartesian3FromMetricVector3(activePlane.anchorECEF);
  const normal = Cartesian3.normalize(
    cartesian3FromMetricVector3(activePlane.normalECEF),
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

  return projectedPositions.map((position) => {
    const delta = Cartesian3.subtract(position, anchor, new Cartesian3());
    return {
      x: Cartesian3.dot(delta, u),
      y: Cartesian3.dot(delta, v),
    };
  });
};

export const resolveAreaPlanarProjectedCoordinates = ({
  coordinates,
  mode,
  preferredFacingPositionECEF,
}: {
  coordinates: readonly CesiumGeographicCoordinate[];
  mode: AreaPlanarProjectionMode;
  preferredFacingPositionECEF?: Cartesian3 | null;
}): readonly CesiumGeographicCoordinate[] | null =>
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
  coordinates: readonly CesiumGeographicCoordinate[];
  mode: AreaPlanarProjectionMode;
  preferredFacingPositionECEF?: Cartesian3 | null;
}): AreaPlanarProjectionResult | null => {
  if (coordinates.length < 3) {
    return null;
  }

  const positions = coordinates.map(cartesian3FromGeographicCoordinate);
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
    projectedCoordinates: projectedPositions.map(
      geographicCoordinateFromCartesian3
    ),
  };
};

const resolveLastValidAreaPlanarProjectionPrefixResult = ({
  coordinates,
  mode,
  preferredFacingPositionECEF,
}: {
  coordinates: readonly CesiumGeographicCoordinate[];
  mode: AreaPlanarProjectionMode;
  preferredFacingPositionECEF?: Cartesian3 | null;
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
  const previousNormal = Cartesian3.normalize(
    cartesian3FromMetricVector3(previousPlane.normalECEF),
    new Cartesian3()
  );
  const nextNormal = Cartesian3.normalize(
    cartesian3FromMetricVector3(nextPlane.normalECEF),
    new Cartesian3()
  );
  const dot = Math.min(
    1,
    Math.max(-1, Math.abs(Cartesian3.dot(previousNormal, nextNormal)))
  );
  const angleDeg = (Math.acos(dot) * 180) / Math.PI;
  return Number.isFinite(angleDeg) ? angleDeg : null;
};

export const canResolveAreaPlanarProjectedPolygon = ({
  coordinates,
  mode,
  preferredFacingPositionECEF,
  previousCoordinates,
  maxPlaneNormalChangeDeg = AREA_PLANAR_DEFAULT_MAX_PLANE_NORMAL_CHANGE_DEG,
}: {
  coordinates: readonly CesiumGeographicCoordinate[];
  mode: AreaPlanarProjectionMode;
  preferredFacingPositionECEF?: Cartesian3 | null;
  previousCoordinates?: readonly CesiumGeographicCoordinate[];
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
        .map(cartesian3FromGeographicCoordinate)
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
  coordinates: readonly CesiumGeographicCoordinate[];
  mode: AreaPlanarProjectionMode;
  preferredFacingPositionECEF?: Cartesian3 | null;
  previousCoordinates?: readonly CesiumGeographicCoordinate[];
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
    .map(cartesian3FromGeographicCoordinate)
    .map((position) => projectPointOntoPlane(position, previousResult.plane));
  const projectedPreviousCoordinates = previousCoordinates.map((coordinate) =>
    geographicCoordinateFromCartesian3(
      projectPointOntoPlane(
        cartesian3FromGeographicCoordinate(coordinate),
        previousResult.plane
      )
    )
  );
  const projectedCoordinates = projectedOnPreviousPlane.map(
    geographicCoordinateFromCartesian3
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
    positions: coordinates.map(cartesian3FromGeographicCoordinate),
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
  coordinates: readonly CesiumGeographicCoordinate[];
  mode: AreaPlanarProjectionMode;
  preferredFacingPositionECEF?: Cartesian3 | null;
  previousCoordinates?: readonly CesiumGeographicCoordinate[];
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
    .map(cartesian3FromGeographicCoordinate)
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
      ? tailPositions.map(geographicCoordinateFromCartesian3)
      : null;
  const fillCoordinateRings = tailCoordinates
    ? [fillResult.projectedCoordinates, tailCoordinates]
    : [fillResult.projectedCoordinates];

  return {
    lineCoordinates: projectedLinePositions.map(
      geographicCoordinateFromCartesian3
    ),
    fillCoordinates: fillResult.projectedCoordinates,
    fillCoordinateRings,
  };
};
