import { Cartesian3 } from "@carma-cesium";
import {
  isPointWithinPlaneOrthogonalToLineAngleTolerance3d,
  projectPointOntoPlane3d,
  projectPointOntoPlaneOrthogonalToLine3d,
} from "@carma-commons/math";
import type { CesiumGeographicCoordinate } from "@carma-mapping/annotations/runtime";
import {
  cartesian3FromGeographicCoordinate,
  getEllipsoidalUpDirectionAtAnchor,
  getSignedCartesian3DistanceToPlane,
  geographicCoordinateFromCartesian3,
} from "@carma-mapping/engines/cesium/core";

export const AREA_PLANAR_TRAPEZOID_DEFAULT_HORIZONTAL_PLANE_TOLERANCE_METERS = 0.2;
// The constructed "horizontal" line is horizontal in the first point's local
// tangent space. Keep the default local; use geodetic line measures for longer
// distances instead of treating one tangent plane as globally horizontal.
export const AREA_PLANAR_TRAPEZOID_DEFAULT_HORIZONTAL_LINE_MAX_LENGTH_METERS = 200;
export const AREA_PLANAR_TRAPEZOID_DEFAULT_THIRD_POINT_RIGHT_ANGLE_TOLERANCE_DEG = 6.5;

export const resolveAreaPlanarTrapezoidHorizontalPlaneToleranceMeters = (
  toleranceMeters: number | null | undefined
): number =>
  Math.max(
    0,
    typeof toleranceMeters === "number" && !Number.isNaN(toleranceMeters)
      ? toleranceMeters
      : AREA_PLANAR_TRAPEZOID_DEFAULT_HORIZONTAL_PLANE_TOLERANCE_METERS
  );

export const resolveAreaPlanarTrapezoidHorizontalLineMaxLengthMeters = (
  maxLengthMeters: number | null | undefined
): number =>
  Math.max(
    0,
    typeof maxLengthMeters === "number" && !Number.isNaN(maxLengthMeters)
      ? maxLengthMeters
      : AREA_PLANAR_TRAPEZOID_DEFAULT_HORIZONTAL_LINE_MAX_LENGTH_METERS
  );

export const resolveAreaPlanarTrapezoidThirdPointRightAngleToleranceDeg = (
  toleranceDeg: number | null | undefined
): number =>
  Math.max(
    0,
    typeof toleranceDeg === "number" && Number.isFinite(toleranceDeg)
      ? toleranceDeg
      : AREA_PLANAR_TRAPEZOID_DEFAULT_THIRD_POINT_RIGHT_ANGLE_TOLERANCE_DEG
  );

export const shouldApplyAreaPlanarTrapezoidRightAngleLimiter = (
  previousCoordinateCount: number
): boolean => previousCoordinateCount === 2 || previousCoordinateCount === 3;

const constrainToAltitude = (
  coordinate: CesiumGeographicCoordinate,
  altitude: number
): CesiumGeographicCoordinate => ({
  ...coordinate,
  altitude,
});

export const resolveAreaPlanarTrapezoidSecondPointHorizontalPlaneCoordinate = ({
  coordinate,
  previousCoordinates,
}: {
  coordinate: CesiumGeographicCoordinate;
  previousCoordinates: readonly CesiumGeographicCoordinate[];
}): CesiumGeographicCoordinate => {
  if (previousCoordinates.length !== 1) {
    return coordinate;
  }

  const baseStartECEF = cartesian3FromGeographicCoordinate(
    previousCoordinates[0]!
  );
  const coordinateOnHorizontalPlanePoint = projectPointOntoPlane3d({
    point: cartesian3FromGeographicCoordinate(coordinate),
    planeAnchor: baseStartECEF,
    planeNormal: getEllipsoidalUpDirectionAtAnchor(baseStartECEF),
    epsilon: 1e-8,
  });
  if (!coordinateOnHorizontalPlanePoint) {
    return constrainToAltitude(
      coordinate,
      previousCoordinates[0]?.altitude ?? coordinate.altitude
    );
  }

  return geographicCoordinateFromCartesian3(
    new Cartesian3(
      coordinateOnHorizontalPlanePoint.x,
      coordinateOnHorizontalPlanePoint.y,
      coordinateOnHorizontalPlanePoint.z
    )
  );
};

const createAutomaticSymmetricParallelCorner = (
  baseStart: CesiumGeographicCoordinate,
  baseEnd: CesiumGeographicCoordinate,
  oppositeCorner: CesiumGeographicCoordinate
): CesiumGeographicCoordinate => {
  const baseStartECEF = cartesian3FromGeographicCoordinate(baseStart);
  const baseEndECEF = cartesian3FromGeographicCoordinate(baseEnd);
  const oppositeCornerECEF = cartesian3FromGeographicCoordinate(oppositeCorner);
  const baseVector = Cartesian3.subtract(
    baseEndECEF,
    baseStartECEF,
    new Cartesian3()
  );
  const baseMagnitudeSquared = Cartesian3.magnitudeSquared(baseVector);
  if (baseMagnitudeSquared <= 1e-8) {
    return oppositeCorner;
  }
  const oppositeDelta = Cartesian3.subtract(
    oppositeCornerECEF,
    baseStartECEF,
    new Cartesian3()
  );
  const oppositeRatio =
    Cartesian3.dot(oppositeDelta, baseVector) / baseMagnitudeSquared;
  const oppositeOffset = Cartesian3.subtract(
    oppositeDelta,
    Cartesian3.multiplyByScalar(baseVector, oppositeRatio, new Cartesian3()),
    new Cartesian3()
  );
  const automaticCornerECEF = Cartesian3.add(
    baseStartECEF,
    Cartesian3.add(
      Cartesian3.multiplyByScalar(
        baseVector,
        1 - oppositeRatio,
        new Cartesian3()
      ),
      oppositeOffset,
      new Cartesian3()
    ),
    new Cartesian3()
  );

  return geographicCoordinateFromCartesian3(automaticCornerECEF);
};

const shouldConnectOppositeCornerToBaseStart = (
  baseStart: CesiumGeographicCoordinate,
  baseEnd: CesiumGeographicCoordinate,
  oppositeCorner: CesiumGeographicCoordinate
): boolean => {
  const baseStartECEF = cartesian3FromGeographicCoordinate(baseStart);
  const baseEndECEF = cartesian3FromGeographicCoordinate(baseEnd);
  const oppositeCornerECEF = cartesian3FromGeographicCoordinate(oppositeCorner);
  return (
    Cartesian3.distanceSquared(oppositeCornerECEF, baseStartECEF) <
    Cartesian3.distanceSquared(oppositeCornerECEF, baseEndECEF)
  );
};

const resolveAreaPlanarTrapezoidRightAngleCoordinate = ({
  coordinate,
  baseStart,
  baseEnd,
  normalPlaneAnchor,
  toleranceDeg,
  limitersSuspended,
}: {
  coordinate: CesiumGeographicCoordinate;
  baseStart: CesiumGeographicCoordinate;
  baseEnd: CesiumGeographicCoordinate;
  normalPlaneAnchor: CesiumGeographicCoordinate;
  toleranceDeg?: number | null;
  limitersSuspended?: boolean;
}): CesiumGeographicCoordinate => {
  if (limitersSuspended) {
    return coordinate;
  }

  const baseStartECEF = cartesian3FromGeographicCoordinate(baseStart);
  const baseEndECEF = cartesian3FromGeographicCoordinate(baseEnd);
  const baseVector = Cartesian3.subtract(
    baseEndECEF,
    baseStartECEF,
    new Cartesian3()
  );
  const coordinateECEF = cartesian3FromGeographicCoordinate(coordinate);
  const normalPlaneAnchorECEF =
    cartesian3FromGeographicCoordinate(normalPlaneAnchor);
  const tolerance =
    resolveAreaPlanarTrapezoidThirdPointRightAngleToleranceDeg(toleranceDeg);
  const isWithinRightAngleTolerance =
    isPointWithinPlaneOrthogonalToLineAngleTolerance3d({
      point: coordinateECEF,
      linePoint: normalPlaneAnchorECEF,
      lineDirection: baseVector,
      toleranceDeg: tolerance,
      epsilon: 1e-8,
    });
  if (!isWithinRightAngleTolerance) {
    return coordinate;
  }

  const rightAnglePoint = projectPointOntoPlaneOrthogonalToLine3d({
    point: coordinateECEF,
    linePoint: normalPlaneAnchorECEF,
    lineDirection: baseVector,
    epsilon: 1e-8,
  });
  if (!rightAnglePoint) {
    return coordinate;
  }

  return geographicCoordinateFromCartesian3(
    new Cartesian3(rightAnglePoint.x, rightAnglePoint.y, rightAnglePoint.z)
  );
};

const constrainToParallelLine = (
  baseStart: CesiumGeographicCoordinate,
  baseEnd: CesiumGeographicCoordinate,
  lineAnchor: CesiumGeographicCoordinate,
  coordinate: CesiumGeographicCoordinate
): CesiumGeographicCoordinate => {
  const baseVector = Cartesian3.subtract(
    cartesian3FromGeographicCoordinate(baseEnd),
    cartesian3FromGeographicCoordinate(baseStart),
    new Cartesian3()
  );
  const baseMagnitudeSquared = Cartesian3.magnitudeSquared(baseVector);
  if (baseMagnitudeSquared <= 1e-8) {
    return coordinate;
  }

  const lineAnchorECEF = cartesian3FromGeographicCoordinate(lineAnchor);
  const coordinateDelta = Cartesian3.subtract(
    cartesian3FromGeographicCoordinate(coordinate),
    lineAnchorECEF,
    new Cartesian3()
  );
  const t = Cartesian3.dot(coordinateDelta, baseVector) / baseMagnitudeSquared;
  return geographicCoordinateFromCartesian3(
    Cartesian3.add(
      lineAnchorECEF,
      Cartesian3.multiplyByScalar(baseVector, t, new Cartesian3()),
      new Cartesian3()
    )
  );
};

export const resolveAreaPlanarTrapezoidThirdPointRightAngleCoordinate = ({
  coordinate,
  previousCoordinates,
  toleranceDeg,
  limitersSuspended,
}: {
  coordinate: CesiumGeographicCoordinate;
  previousCoordinates: readonly CesiumGeographicCoordinate[];
  toleranceDeg?: number | null;
  limitersSuspended?: boolean;
}): CesiumGeographicCoordinate => {
  if (limitersSuspended || previousCoordinates.length !== 2) {
    return coordinate;
  }

  const baseStart = previousCoordinates[0]!;
  const baseEnd =
    resolveAreaPlanarTrapezoidSecondPointHorizontalPlaneCoordinate({
      coordinate: previousCoordinates[1]!,
      previousCoordinates: [baseStart],
    });
  const normalPlaneAnchor = shouldConnectOppositeCornerToBaseStart(
    baseStart,
    baseEnd,
    coordinate
  )
    ? baseStart
    : baseEnd;
  return resolveAreaPlanarTrapezoidRightAngleCoordinate({
    coordinate,
    baseStart,
    baseEnd,
    normalPlaneAnchor,
    toleranceDeg,
    limitersSuspended,
  });
};

const resolveAreaPlanarTrapezoidFourthPointRightAngleCoordinate = ({
  coordinate,
  baseStart,
  baseEnd,
  oppositeCorner,
  toleranceDeg,
  limitersSuspended,
}: {
  coordinate: CesiumGeographicCoordinate;
  baseStart: CesiumGeographicCoordinate;
  baseEnd: CesiumGeographicCoordinate;
  oppositeCorner: CesiumGeographicCoordinate;
  toleranceDeg?: number | null;
  limitersSuspended?: boolean;
}): CesiumGeographicCoordinate => {
  const normalPlaneAnchor = shouldConnectOppositeCornerToBaseStart(
    baseStart,
    baseEnd,
    oppositeCorner
  )
    ? baseEnd
    : baseStart;
  return resolveAreaPlanarTrapezoidRightAngleCoordinate({
    coordinate,
    baseStart,
    baseEnd,
    normalPlaneAnchor,
    toleranceDeg,
    limitersSuspended,
  });
};

export const getAreaPlanarTrapezoidSecondPointHorizontalLineLengthMeters = ({
  coordinate,
  previousCoordinates,
}: {
  coordinate: CesiumGeographicCoordinate;
  previousCoordinates: readonly CesiumGeographicCoordinate[];
}): number | null => {
  if (previousCoordinates.length !== 1) {
    return null;
  }

  const baseStartECEF = cartesian3FromGeographicCoordinate(
    previousCoordinates[0]!
  );
  const horizontalNormal = getEllipsoidalUpDirectionAtAnchor(baseStartECEF);
  const coordinateOnHorizontalPlanePoint = projectPointOntoPlane3d({
    point: cartesian3FromGeographicCoordinate(coordinate),
    planeAnchor: baseStartECEF,
    planeNormal: horizontalNormal,
    epsilon: 1e-8,
  });
  if (!coordinateOnHorizontalPlanePoint) {
    return null;
  }
  const coordinateOnHorizontalPlane = new Cartesian3(
    coordinateOnHorizontalPlanePoint.x,
    coordinateOnHorizontalPlanePoint.y,
    coordinateOnHorizontalPlanePoint.z
  );

  return Cartesian3.distance(baseStartECEF, coordinateOnHorizontalPlane);
};

export const getAreaPlanarTrapezoidSecondPointHorizontalPlaneDistanceMeters = ({
  coordinate,
  previousCoordinates,
}: {
  coordinate: CesiumGeographicCoordinate;
  previousCoordinates: readonly CesiumGeographicCoordinate[];
}): number | null => {
  if (previousCoordinates.length !== 1) {
    return null;
  }

  const baseStartECEF = cartesian3FromGeographicCoordinate(
    previousCoordinates[0]!
  );
  const coordinateECEF = cartesian3FromGeographicCoordinate(coordinate);
  return Math.abs(
    getSignedCartesian3DistanceToPlane(
      coordinateECEF,
      baseStartECEF,
      getEllipsoidalUpDirectionAtAnchor(baseStartECEF)
    )
  );
};

export const canPlaceAreaPlanarTrapezoidSecondPointWithinHorizontalLineMaxLength =
  ({
    coordinate,
    previousCoordinates,
    maxLengthMeters,
  }: {
    coordinate: CesiumGeographicCoordinate;
    previousCoordinates: readonly CesiumGeographicCoordinate[];
    maxLengthMeters?: number | null;
  }): boolean => {
    const lineLengthMeters =
      getAreaPlanarTrapezoidSecondPointHorizontalLineLengthMeters({
        coordinate,
        previousCoordinates,
      });
    if (lineLengthMeters === null) {
      return true;
    }

    return (
      lineLengthMeters <=
      resolveAreaPlanarTrapezoidHorizontalLineMaxLengthMeters(maxLengthMeters)
    );
  };

export const canPlaceAreaPlanarTrapezoidSecondPointOnHorizontalPlane = ({
  coordinate,
  previousCoordinates,
  toleranceMeters,
}: {
  coordinate: CesiumGeographicCoordinate;
  previousCoordinates: readonly CesiumGeographicCoordinate[];
  toleranceMeters?: number | null;
}): boolean => {
  const distanceMeters =
    getAreaPlanarTrapezoidSecondPointHorizontalPlaneDistanceMeters({
      coordinate,
      previousCoordinates,
    });
  if (distanceMeters === null) {
    return true;
  }

  return (
    distanceMeters <=
    resolveAreaPlanarTrapezoidHorizontalPlaneToleranceMeters(toleranceMeters)
  );
};

export const resolveAreaPlanarTrapezoidDraftCoordinates = (
  coordinates: readonly CesiumGeographicCoordinate[],
  options: {
    thirdPointRightAngleToleranceDeg?: number | null;
    applyRightAngleLimiter?: boolean;
    limitersSuspended?: boolean;
  } = {}
): readonly CesiumGeographicCoordinate[] => {
  if (coordinates.length < 2) {
    return coordinates;
  }

  const baseStart = coordinates[0]!;
  const baseEnd =
    resolveAreaPlanarTrapezoidSecondPointHorizontalPlaneCoordinate({
      coordinate: coordinates[1]!,
      previousCoordinates: [baseStart],
    });
  const oppositeCorner = coordinates[2]
    ? options.applyRightAngleLimiter
      ? resolveAreaPlanarTrapezoidThirdPointRightAngleCoordinate({
          coordinate: coordinates[2],
          previousCoordinates: [baseStart, baseEnd],
          toleranceDeg: options.thirdPointRightAngleToleranceDeg,
          limitersSuspended: options.limitersSuspended,
        })
      : coordinates[2]
    : undefined;
  if (!oppositeCorner || coordinates.length < 4) {
    return oppositeCorner
      ? [baseStart, baseEnd, oppositeCorner]
      : [baseStart, baseEnd];
  }

  const fourthPoint = options.applyRightAngleLimiter
    ? resolveAreaPlanarTrapezoidFourthPointRightAngleCoordinate({
        coordinate: coordinates[3]!,
        baseStart,
        baseEnd,
        oppositeCorner,
        toleranceDeg: options.thirdPointRightAngleToleranceDeg,
        limitersSuspended: options.limitersSuspended,
      })
    : coordinates[3]!;

  return [
    baseStart,
    baseEnd,
    oppositeCorner,
    constrainToParallelLine(baseStart, baseEnd, oppositeCorner, fourthPoint),
  ];
};

export const resolveNextAreaPlanarTrapezoidDraftCoordinates = ({
  coordinate,
  previousCoordinates,
  thirdPointRightAngleToleranceDeg,
  limitersSuspended,
}: {
  coordinate: CesiumGeographicCoordinate;
  previousCoordinates: readonly CesiumGeographicCoordinate[];
  thirdPointRightAngleToleranceDeg?: number | null;
  limitersSuspended?: boolean;
}): readonly CesiumGeographicCoordinate[] | null =>
  previousCoordinates.length >= 4
    ? null
    : resolveAreaPlanarTrapezoidDraftCoordinates(
        [...previousCoordinates, coordinate],
        {
          thirdPointRightAngleToleranceDeg,
          applyRightAngleLimiter:
            shouldApplyAreaPlanarTrapezoidRightAngleLimiter(
              previousCoordinates.length
            ),
          limitersSuspended,
        }
      );

const areCoordinatesWithinDistanceMeters = (
  left: CesiumGeographicCoordinate,
  right: CesiumGeographicCoordinate,
  epsilonMeters = 1e-4
): boolean =>
  Cartesian3.distance(
    cartesian3FromGeographicCoordinate(left),
    cartesian3FromGeographicCoordinate(right)
  ) <= epsilonMeters;

export const doesAreaPlanarTrapezoidSampleRequireLimiterOverride = ({
  coordinate,
  previousCoordinates,
  horizontalPlaneToleranceMeters,
  horizontalLineMaxLengthMeters,
  thirdPointRightAngleToleranceDeg,
}: {
  coordinate: CesiumGeographicCoordinate;
  previousCoordinates: readonly CesiumGeographicCoordinate[];
  horizontalPlaneToleranceMeters?: number | null;
  horizontalLineMaxLengthMeters?: number | null;
  thirdPointRightAngleToleranceDeg?: number | null;
}): boolean => {
  if (previousCoordinates.length === 1) {
    return (
      !canPlaceAreaPlanarTrapezoidSecondPointOnHorizontalPlane({
        coordinate,
        previousCoordinates,
        toleranceMeters: horizontalPlaneToleranceMeters,
      }) ||
      !canPlaceAreaPlanarTrapezoidSecondPointWithinHorizontalLineMaxLength({
        coordinate,
        previousCoordinates,
        maxLengthMeters: horizontalLineMaxLengthMeters,
      })
    );
  }

  if (
    !shouldApplyAreaPlanarTrapezoidRightAngleLimiter(previousCoordinates.length)
  ) {
    return false;
  }

  const limitedCoordinates = resolveNextAreaPlanarTrapezoidDraftCoordinates({
    coordinate,
    previousCoordinates,
    thirdPointRightAngleToleranceDeg,
    limitersSuspended: false,
  });
  const suspendedLimiterCoordinates =
    resolveNextAreaPlanarTrapezoidDraftCoordinates({
    coordinate,
    previousCoordinates,
    thirdPointRightAngleToleranceDeg,
    limitersSuspended: true,
  });
  const nextCoordinateIndex = previousCoordinates.length;
  const limitedCoordinate = limitedCoordinates?.[nextCoordinateIndex];
  const suspendedLimiterCoordinate =
    suspendedLimiterCoordinates?.[nextCoordinateIndex];

  return Boolean(
    limitedCoordinate &&
      suspendedLimiterCoordinate &&
      !areCoordinatesWithinDistanceMeters(
        limitedCoordinate,
        suspendedLimiterCoordinate
      )
  );
};

export const resolveAreaPlanarTrapezoidMeasurementCoordinates = (
  coordinates: readonly CesiumGeographicCoordinate[],
  options: {
    thirdPointRightAngleToleranceDeg?: number | null;
    applyRightAngleLimiter?: boolean;
    limitersSuspended?: boolean;
  } = {}
): readonly CesiumGeographicCoordinate[] => {
  const draftCoordinates = resolveAreaPlanarTrapezoidDraftCoordinates(
    coordinates,
    options
  );
  if (draftCoordinates.length !== 3) {
    return draftCoordinates.slice(0, 4);
  }

  const [baseStart, baseEnd, oppositeCorner] = draftCoordinates;
  const automaticCorner = createAutomaticSymmetricParallelCorner(
    baseStart!,
    baseEnd!,
    oppositeCorner!
  );
  if (
    shouldConnectOppositeCornerToBaseStart(
      baseStart!,
      baseEnd!,
      oppositeCorner!
    )
  ) {
    return [baseStart!, baseEnd!, automaticCorner, oppositeCorner!];
  }
  return [baseStart!, baseEnd!, oppositeCorner!, automaticCorner];
};
