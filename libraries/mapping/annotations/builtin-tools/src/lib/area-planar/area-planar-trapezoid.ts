import { Vector3 } from "three";
import {
  isPointWithinPlaneOrthogonalToLineAngleTolerance3d,
  projectPointOntoPlane3d,
  projectPointOntoPlaneOrthogonalToLine3d,
} from "@carma-commons/math";
import {
  ecefFromGeographicCoordinate,
  geographicCoordinateFromEcef,
  getEllipsoidalUpDirectionAtAnchor,
  getSignedVector3DistanceToPlane,
  type AnnotationGeographicCoordinate,
} from "@carma-mapping/annotations/core";

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
  coordinate: AnnotationGeographicCoordinate,
  altitude: number
): AnnotationGeographicCoordinate => ({
  ...coordinate,
  altitude,
});

export const resolveAreaPlanarTrapezoidSecondPointHorizontalPlaneCoordinate = ({
  coordinate,
  previousCoordinates,
}: {
  coordinate: AnnotationGeographicCoordinate;
  previousCoordinates: readonly AnnotationGeographicCoordinate[];
}): AnnotationGeographicCoordinate => {
  if (previousCoordinates.length !== 1) {
    return coordinate;
  }

  const baseStartECEF = ecefFromGeographicCoordinate(previousCoordinates[0]!);
  const coordinateOnHorizontalPlanePoint = projectPointOntoPlane3d({
    point: ecefFromGeographicCoordinate(coordinate),
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

  return geographicCoordinateFromEcef(
    new Vector3(
      coordinateOnHorizontalPlanePoint.x,
      coordinateOnHorizontalPlanePoint.y,
      coordinateOnHorizontalPlanePoint.z
    )
  );
};

const createAutomaticSymmetricParallelCorner = (
  baseStart: AnnotationGeographicCoordinate,
  baseEnd: AnnotationGeographicCoordinate,
  oppositeCorner: AnnotationGeographicCoordinate
): AnnotationGeographicCoordinate => {
  const baseStartECEF = ecefFromGeographicCoordinate(baseStart);
  const baseEndECEF = ecefFromGeographicCoordinate(baseEnd);
  const oppositeCornerECEF = ecefFromGeographicCoordinate(oppositeCorner);
  const baseVector = new Vector3().subVectors(baseEndECEF, baseStartECEF);
  const baseMagnitudeSquared = baseVector.lengthSq();
  if (baseMagnitudeSquared <= 1e-8) {
    return oppositeCorner;
  }
  const oppositeDelta = new Vector3().subVectors(
    oppositeCornerECEF,
    baseStartECEF
  );
  const oppositeRatio = oppositeDelta.dot(baseVector) / baseMagnitudeSquared;
  const oppositeOffset = new Vector3().subVectors(
    oppositeDelta,
    baseVector.clone().multiplyScalar(oppositeRatio)
  );
  const automaticCornerECEF = baseStartECEF.clone().add(
    baseVector
      .clone()
      .multiplyScalar(1 - oppositeRatio)
      .add(oppositeOffset)
  );

  return geographicCoordinateFromEcef(automaticCornerECEF);
};

const shouldConnectOppositeCornerToBaseStart = (
  baseStart: AnnotationGeographicCoordinate,
  baseEnd: AnnotationGeographicCoordinate,
  oppositeCorner: AnnotationGeographicCoordinate
): boolean => {
  const baseStartECEF = ecefFromGeographicCoordinate(baseStart);
  const baseEndECEF = ecefFromGeographicCoordinate(baseEnd);
  const oppositeCornerECEF = ecefFromGeographicCoordinate(oppositeCorner);
  return (
    oppositeCornerECEF.distanceToSquared(baseStartECEF) <
    oppositeCornerECEF.distanceToSquared(baseEndECEF)
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
  coordinate: AnnotationGeographicCoordinate;
  baseStart: AnnotationGeographicCoordinate;
  baseEnd: AnnotationGeographicCoordinate;
  normalPlaneAnchor: AnnotationGeographicCoordinate;
  toleranceDeg?: number | null;
  limitersSuspended?: boolean;
}): AnnotationGeographicCoordinate => {
  if (limitersSuspended) {
    return coordinate;
  }

  const baseStartECEF = ecefFromGeographicCoordinate(baseStart);
  const baseEndECEF = ecefFromGeographicCoordinate(baseEnd);
  const baseVector = new Vector3().subVectors(baseEndECEF, baseStartECEF);
  const coordinateECEF = ecefFromGeographicCoordinate(coordinate);
  const normalPlaneAnchorECEF = ecefFromGeographicCoordinate(normalPlaneAnchor);
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

  return geographicCoordinateFromEcef(
    new Vector3(rightAnglePoint.x, rightAnglePoint.y, rightAnglePoint.z)
  );
};

const constrainToParallelLine = (
  baseStart: AnnotationGeographicCoordinate,
  baseEnd: AnnotationGeographicCoordinate,
  lineAnchor: AnnotationGeographicCoordinate,
  coordinate: AnnotationGeographicCoordinate
): AnnotationGeographicCoordinate => {
  const baseVector = new Vector3().subVectors(
    ecefFromGeographicCoordinate(baseEnd),
    ecefFromGeographicCoordinate(baseStart)
  );
  const baseMagnitudeSquared = baseVector.lengthSq();
  if (baseMagnitudeSquared <= 1e-8) {
    return coordinate;
  }

  const lineAnchorECEF = ecefFromGeographicCoordinate(lineAnchor);
  const coordinateDelta = new Vector3().subVectors(
    ecefFromGeographicCoordinate(coordinate),
    lineAnchorECEF
  );
  const t = coordinateDelta.dot(baseVector) / baseMagnitudeSquared;
  return geographicCoordinateFromEcef(
    lineAnchorECEF.clone().add(baseVector.clone().multiplyScalar(t))
  );
};

export const resolveAreaPlanarTrapezoidThirdPointRightAngleCoordinate = ({
  coordinate,
  previousCoordinates,
  toleranceDeg,
  limitersSuspended,
}: {
  coordinate: AnnotationGeographicCoordinate;
  previousCoordinates: readonly AnnotationGeographicCoordinate[];
  toleranceDeg?: number | null;
  limitersSuspended?: boolean;
}): AnnotationGeographicCoordinate => {
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
  coordinate: AnnotationGeographicCoordinate;
  baseStart: AnnotationGeographicCoordinate;
  baseEnd: AnnotationGeographicCoordinate;
  oppositeCorner: AnnotationGeographicCoordinate;
  toleranceDeg?: number | null;
  limitersSuspended?: boolean;
}): AnnotationGeographicCoordinate => {
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
  coordinate: AnnotationGeographicCoordinate;
  previousCoordinates: readonly AnnotationGeographicCoordinate[];
}): number | null => {
  if (previousCoordinates.length !== 1) {
    return null;
  }

  const baseStartECEF = ecefFromGeographicCoordinate(previousCoordinates[0]!);
  const horizontalNormal = getEllipsoidalUpDirectionAtAnchor(baseStartECEF);
  const coordinateOnHorizontalPlanePoint = projectPointOntoPlane3d({
    point: ecefFromGeographicCoordinate(coordinate),
    planeAnchor: baseStartECEF,
    planeNormal: horizontalNormal,
    epsilon: 1e-8,
  });
  if (!coordinateOnHorizontalPlanePoint) {
    return null;
  }
  const coordinateOnHorizontalPlane = new Vector3(
    coordinateOnHorizontalPlanePoint.x,
    coordinateOnHorizontalPlanePoint.y,
    coordinateOnHorizontalPlanePoint.z
  );

  return baseStartECEF.distanceTo(coordinateOnHorizontalPlane);
};

export const getAreaPlanarTrapezoidSecondPointHorizontalPlaneDistanceMeters = ({
  coordinate,
  previousCoordinates,
}: {
  coordinate: AnnotationGeographicCoordinate;
  previousCoordinates: readonly AnnotationGeographicCoordinate[];
}): number | null => {
  if (previousCoordinates.length !== 1) {
    return null;
  }

  const baseStartECEF = ecefFromGeographicCoordinate(previousCoordinates[0]!);
  const coordinateECEF = ecefFromGeographicCoordinate(coordinate);
  return Math.abs(
    getSignedVector3DistanceToPlane(
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
    coordinate: AnnotationGeographicCoordinate;
    previousCoordinates: readonly AnnotationGeographicCoordinate[];
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
  coordinate: AnnotationGeographicCoordinate;
  previousCoordinates: readonly AnnotationGeographicCoordinate[];
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
  coordinates: readonly AnnotationGeographicCoordinate[],
  options: {
    thirdPointRightAngleToleranceDeg?: number | null;
    applyRightAngleLimiter?: boolean;
    limitersSuspended?: boolean;
  } = {}
): readonly AnnotationGeographicCoordinate[] => {
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
  coordinate: AnnotationGeographicCoordinate;
  previousCoordinates: readonly AnnotationGeographicCoordinate[];
  thirdPointRightAngleToleranceDeg?: number | null;
  limitersSuspended?: boolean;
}): readonly AnnotationGeographicCoordinate[] | null => {
  if (previousCoordinates.length >= 4) {
    return null;
  }

  if (previousCoordinates.length === 0) {
    return [coordinate];
  }

  if (previousCoordinates.length === 1) {
    const baseStart = previousCoordinates[0]!;
    return [
      baseStart,
      resolveAreaPlanarTrapezoidSecondPointHorizontalPlaneCoordinate({
        coordinate,
        previousCoordinates: [baseStart],
      }),
    ];
  }

  if (previousCoordinates.length === 2) {
    return [
      ...previousCoordinates,
      resolveAreaPlanarTrapezoidThirdPointRightAngleCoordinate({
        coordinate,
        previousCoordinates,
        toleranceDeg: thirdPointRightAngleToleranceDeg,
        limitersSuspended,
      }),
    ];
  }

  const [baseStart, baseEnd, oppositeCorner] = previousCoordinates;
  const fourthPoint = resolveAreaPlanarTrapezoidFourthPointRightAngleCoordinate(
    {
      coordinate,
      baseStart: baseStart!,
      baseEnd: baseEnd!,
      oppositeCorner: oppositeCorner!,
      toleranceDeg: thirdPointRightAngleToleranceDeg,
      limitersSuspended,
    }
  );

  return [
    baseStart!,
    baseEnd!,
    oppositeCorner!,
    constrainToParallelLine(baseStart!, baseEnd!, oppositeCorner!, fourthPoint),
  ];
};

const areCoordinatesWithinDistanceMeters = (
  left: AnnotationGeographicCoordinate,
  right: AnnotationGeographicCoordinate,
  epsilonMeters = 1e-4
): boolean =>
  ecefFromGeographicCoordinate(left).distanceTo(
    ecefFromGeographicCoordinate(right)
  ) <= epsilonMeters;

export const doesAreaPlanarTrapezoidSampleRequireLimiterOverride = ({
  coordinate,
  previousCoordinates,
  horizontalPlaneToleranceMeters,
  horizontalLineMaxLengthMeters,
  thirdPointRightAngleToleranceDeg,
}: {
  coordinate: AnnotationGeographicCoordinate;
  previousCoordinates: readonly AnnotationGeographicCoordinate[];
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
  coordinates: readonly AnnotationGeographicCoordinate[]
): readonly AnnotationGeographicCoordinate[] => {
  const draftCoordinates = coordinates.slice(0, 4);
  if (draftCoordinates.length !== 3) {
    return draftCoordinates;
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
