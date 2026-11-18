import {
  getSignedVector3DistanceToPlane,
  isPointWithinPlaneOrthogonalToLineAngleTolerance3d,
  projectPointOntoPlaneOrthogonalToLine3d,
  projectVector3OntoPlane,
  removeVector3ComponentAlongAxis,
} from "@carma-commons/math";
import {
  ecefFromGeographicCoordinate as toEcef,
  geographicCoordinateFromEcef as fromEcef,
  getEllipsoidalUpDirectionAtAnchor,
} from "@carma-geo/proj";
import type { AnnotationGeographicCoordinate as Coordinate } from "@carma-mapping/annotations/core";
import type { Degrees, Meters } from "@carma-units";
import { Line3, Vector3 } from "three";

export const AREA_PLANAR_TRAPEZOID_DEFAULT_HORIZONTAL_PLANE_TOLERANCE_METERS =
  0.2 as Meters;
// The constructed "horizontal" line is horizontal in the first point's local
// tangent space. Keep the default local; use geodetic line measures for longer
// distances instead of treating one tangent plane as globally horizontal.
export const AREA_PLANAR_TRAPEZOID_DEFAULT_HORIZONTAL_LINE_MAX_LENGTH_METERS =
  200 as Meters;
export const AREA_PLANAR_TRAPEZOID_DEFAULT_THIRD_POINT_RIGHT_ANGLE_TOLERANCE_DEG =
  6.5 as Degrees;

const DEGENERATE_BASE_LENGTH_SQUARED = 1e-8;
const SAMPLE_COINCIDENCE_METERS = 1e-4;

const nonNegativeOr = <T extends number>(
  value: number | null | undefined,
  fallback: T
): T =>
  Math.max(
    0,
    typeof value === "number" && !Number.isNaN(value) ? value : fallback
  ) as T;

export const resolveAreaPlanarTrapezoidHorizontalPlaneToleranceMeters = (
  toleranceMeters: number | null | undefined
): Meters =>
  nonNegativeOr(
    toleranceMeters,
    AREA_PLANAR_TRAPEZOID_DEFAULT_HORIZONTAL_PLANE_TOLERANCE_METERS
  );

export const resolveAreaPlanarTrapezoidHorizontalLineMaxLengthMeters = (
  maxLengthMeters: number | null | undefined
): Meters =>
  nonNegativeOr(
    maxLengthMeters,
    AREA_PLANAR_TRAPEZOID_DEFAULT_HORIZONTAL_LINE_MAX_LENGTH_METERS
  );

export const resolveAreaPlanarTrapezoidThirdPointRightAngleToleranceDeg = (
  toleranceDeg: number | null | undefined
): Degrees =>
  nonNegativeOr(
    typeof toleranceDeg === "number" && Number.isFinite(toleranceDeg)
      ? toleranceDeg
      : null,
    AREA_PLANAR_TRAPEZOID_DEFAULT_THIRD_POINT_RIGHT_ANGLE_TOLERANCE_DEG
  );

export const shouldApplyAreaPlanarTrapezoidRightAngleLimiter = (
  previousCoordinateCount: number
): boolean => previousCoordinateCount === 2 || previousCoordinateCount === 3;

/** The coordinate projected onto the horizontal plane through the base start. */
const projectOntoHorizontalPlane = (
  coordinate: Coordinate,
  baseStart: Coordinate
): Vector3 => {
  const anchor = toEcef(baseStart);
  return projectVector3OntoPlane(
    toEcef(coordinate),
    anchor,
    getEllipsoidalUpDirectionAtAnchor(anchor)
  );
};

const resolveSecondPointHorizontalPlaneCoordinate = (
  coordinate: Coordinate,
  baseStart: Coordinate
): Coordinate => fromEcef(projectOntoHorizontalPlane(coordinate, baseStart));

/** The fourth corner that mirrors the third one across the middle of the base. */
const createAutomaticSymmetricParallelCorner = (
  baseStart: Coordinate,
  baseEnd: Coordinate,
  oppositeCorner: Coordinate
): Coordinate => {
  const baseStartECEF = toEcef(baseStart);
  const baseVector = new Vector3().subVectors(toEcef(baseEnd), baseStartECEF);
  const baseMagnitudeSquared = baseVector.lengthSq();
  if (baseMagnitudeSquared <= DEGENERATE_BASE_LENGTH_SQUARED) {
    return oppositeCorner;
  }
  const oppositeDelta = new Vector3().subVectors(
    toEcef(oppositeCorner),
    baseStartECEF
  );
  const oppositeRatio = oppositeDelta.dot(baseVector) / baseMagnitudeSquared;
  const oppositeOffset = removeVector3ComponentAlongAxis(
    oppositeDelta,
    baseVector
  );

  return fromEcef(
    baseStartECEF
      .clone()
      .addScaledVector(baseVector, 1 - oppositeRatio)
      .add(oppositeOffset)
  );
};

const shouldConnectOppositeCornerToBaseStart = (
  baseStart: Coordinate,
  baseEnd: Coordinate,
  oppositeCorner: Coordinate
): boolean => {
  const oppositeCornerECEF = toEcef(oppositeCorner);
  return (
    oppositeCornerECEF.distanceToSquared(toEcef(baseStart)) <
    oppositeCornerECEF.distanceToSquared(toEcef(baseEnd))
  );
};

/** Snaps the coordinate into the plane orthogonal to the base when it is within the angle tolerance. */
const resolveRightAngleCoordinate = ({
  coordinate,
  baseStart,
  baseEnd,
  normalPlaneAnchor,
  toleranceDeg,
  limitersSuspended,
}: {
  coordinate: Coordinate;
  baseStart: Coordinate;
  baseEnd: Coordinate;
  normalPlaneAnchor: Coordinate;
  toleranceDeg?: number | null;
  limitersSuspended?: boolean;
}): Coordinate => {
  if (limitersSuspended) {
    return coordinate;
  }

  const plane = {
    point: toEcef(coordinate),
    linePoint: toEcef(normalPlaneAnchor),
    lineDirection: new Vector3().subVectors(toEcef(baseEnd), toEcef(baseStart)),
    epsilon: 1e-8,
  };
  if (
    !isPointWithinPlaneOrthogonalToLineAngleTolerance3d({
      ...plane,
      toleranceDeg:
        resolveAreaPlanarTrapezoidThirdPointRightAngleToleranceDeg(
          toleranceDeg
        ),
    })
  ) {
    return coordinate;
  }

  const rightAnglePoint = projectPointOntoPlaneOrthogonalToLine3d(plane);
  return rightAnglePoint
    ? fromEcef(
        new Vector3(rightAnglePoint.x, rightAnglePoint.y, rightAnglePoint.z)
      )
    : coordinate;
};

/** The coordinate projected onto the line through the anchor that runs parallel to the base. */
const constrainToParallelLine = (
  baseStart: Coordinate,
  baseEnd: Coordinate,
  lineAnchor: Coordinate,
  coordinate: Coordinate
): Coordinate => {
  const baseVector = new Vector3().subVectors(
    toEcef(baseEnd),
    toEcef(baseStart)
  );
  if (baseVector.lengthSq() <= DEGENERATE_BASE_LENGTH_SQUARED) {
    return coordinate;
  }

  const anchor = toEcef(lineAnchor);
  return fromEcef(
    new Line3(anchor, anchor.clone().add(baseVector)).closestPointToPoint(
      toEcef(coordinate),
      false,
      new Vector3()
    )
  );
};

const resolveThirdPointRightAngleCoordinate = ({
  coordinate,
  previousCoordinates,
  toleranceDeg,
  limitersSuspended,
}: {
  coordinate: Coordinate;
  previousCoordinates: readonly Coordinate[];
  toleranceDeg?: number | null;
  limitersSuspended?: boolean;
}): Coordinate => {
  if (limitersSuspended || previousCoordinates.length !== 2) {
    return coordinate;
  }

  const baseStart = previousCoordinates[0]!;
  const baseEnd = resolveSecondPointHorizontalPlaneCoordinate(
    previousCoordinates[1]!,
    baseStart
  );
  return resolveRightAngleCoordinate({
    coordinate,
    baseStart,
    baseEnd,
    normalPlaneAnchor: shouldConnectOppositeCornerToBaseStart(
      baseStart,
      baseEnd,
      coordinate
    )
      ? baseStart
      : baseEnd,
    toleranceDeg,
    limitersSuspended,
  });
};

const resolveFourthPointRightAngleCoordinate = ({
  coordinate,
  baseStart,
  baseEnd,
  oppositeCorner,
  toleranceDeg,
  limitersSuspended,
}: {
  coordinate: Coordinate;
  baseStart: Coordinate;
  baseEnd: Coordinate;
  oppositeCorner: Coordinate;
  toleranceDeg?: number | null;
  limitersSuspended?: boolean;
}): Coordinate =>
  resolveRightAngleCoordinate({
    coordinate,
    baseStart,
    baseEnd,
    normalPlaneAnchor: shouldConnectOppositeCornerToBaseStart(
      baseStart,
      baseEnd,
      oppositeCorner
    )
      ? baseEnd
      : baseStart,
    toleranceDeg,
    limitersSuspended,
  });

/** Length of the second point's horizontal line from the first point; null unless exactly one point is placed. */
const getSecondPointHorizontalLineLengthMeters = (
  coordinate: Coordinate,
  previousCoordinates: readonly Coordinate[]
): Meters | null =>
  previousCoordinates.length === 1
    ? (toEcef(previousCoordinates[0]!).distanceTo(
        projectOntoHorizontalPlane(coordinate, previousCoordinates[0]!)
      ) as Meters)
    : null;

/** Height of the second point above or below the horizontal plane of the first point. */
const getSecondPointHorizontalPlaneDistanceMeters = (
  coordinate: Coordinate,
  previousCoordinates: readonly Coordinate[]
): Meters | null => {
  if (previousCoordinates.length !== 1) {
    return null;
  }

  const baseStartECEF = toEcef(previousCoordinates[0]!);
  return Math.abs(
    getSignedVector3DistanceToPlane(
      toEcef(coordinate),
      baseStartECEF,
      getEllipsoidalUpDirectionAtAnchor(baseStartECEF)
    )
  ) as Meters;
};

export const canPlaceAreaPlanarTrapezoidSecondPointWithinHorizontalLineMaxLength =
  ({
    coordinate,
    previousCoordinates,
    maxLengthMeters,
  }: {
    coordinate: Coordinate;
    previousCoordinates: readonly Coordinate[];
    maxLengthMeters?: number | null;
  }): boolean => {
    const lineLengthMeters = getSecondPointHorizontalLineLengthMeters(
      coordinate,
      previousCoordinates
    );
    return (
      lineLengthMeters === null ||
      lineLengthMeters <=
        resolveAreaPlanarTrapezoidHorizontalLineMaxLengthMeters(maxLengthMeters)
    );
  };

export const canPlaceAreaPlanarTrapezoidSecondPointOnHorizontalPlane = ({
  coordinate,
  previousCoordinates,
  toleranceMeters,
}: {
  coordinate: Coordinate;
  previousCoordinates: readonly Coordinate[];
  toleranceMeters?: number | null;
}): boolean => {
  const distanceMeters = getSecondPointHorizontalPlaneDistanceMeters(
    coordinate,
    previousCoordinates
  );
  return (
    distanceMeters === null ||
    distanceMeters <=
      resolveAreaPlanarTrapezoidHorizontalPlaneToleranceMeters(toleranceMeters)
  );
};

/** The draft with the next coordinate placed under the trapezoid constraints; null once complete. */
export const resolveNextAreaPlanarTrapezoidDraftCoordinates = ({
  coordinate,
  previousCoordinates,
  thirdPointRightAngleToleranceDeg,
  limitersSuspended,
}: {
  coordinate: Coordinate;
  previousCoordinates: readonly Coordinate[];
  thirdPointRightAngleToleranceDeg?: number | null;
  limitersSuspended?: boolean;
}): readonly Coordinate[] | null => {
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
      resolveSecondPointHorizontalPlaneCoordinate(coordinate, baseStart),
    ];
  }

  if (previousCoordinates.length === 2) {
    return [
      ...previousCoordinates,
      resolveThirdPointRightAngleCoordinate({
        coordinate,
        previousCoordinates,
        toleranceDeg: thirdPointRightAngleToleranceDeg,
        limitersSuspended,
      }),
    ];
  }

  const [baseStart, baseEnd, oppositeCorner] = previousCoordinates as [
    Coordinate,
    Coordinate,
    Coordinate
  ];
  const fourthPoint = resolveFourthPointRightAngleCoordinate({
    coordinate,
    baseStart,
    baseEnd,
    oppositeCorner,
    toleranceDeg: thirdPointRightAngleToleranceDeg,
    limitersSuspended,
  });

  return [
    baseStart,
    baseEnd,
    oppositeCorner,
    constrainToParallelLine(baseStart, baseEnd, oppositeCorner, fourthPoint),
  ];
};

/** Whether suspending the limiters (shift) would move the next coordinate. */
export const doesAreaPlanarTrapezoidSampleRequireLimiterOverride = ({
  coordinate,
  previousCoordinates,
  horizontalPlaneToleranceMeters,
  horizontalLineMaxLengthMeters,
  thirdPointRightAngleToleranceDeg,
}: {
  coordinate: Coordinate;
  previousCoordinates: readonly Coordinate[];
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

  const nextCoordinateIndex = previousCoordinates.length;
  const [limitedCoordinate, unlimitedCoordinate] = [false, true].map(
    (limitersSuspended) =>
      resolveNextAreaPlanarTrapezoidDraftCoordinates({
        coordinate,
        previousCoordinates,
        thirdPointRightAngleToleranceDeg,
        limitersSuspended,
      })?.[nextCoordinateIndex]
  );

  return Boolean(
    limitedCoordinate &&
      unlimitedCoordinate &&
      toEcef(limitedCoordinate).distanceTo(toEcef(unlimitedCoordinate)) >
        SAMPLE_COINCIDENCE_METERS
  );
};

/** The four corners to measure: a third-point draft gets the automatic fourth corner. */
export const resolveAreaPlanarTrapezoidMeasurementCoordinates = (
  coordinates: readonly Coordinate[]
): readonly Coordinate[] => {
  const draftCoordinates = coordinates.slice(0, 4);
  if (draftCoordinates.length !== 3) {
    return draftCoordinates;
  }

  const [baseStart, baseEnd, oppositeCorner] = draftCoordinates as [
    Coordinate,
    Coordinate,
    Coordinate
  ];
  const automaticCorner = createAutomaticSymmetricParallelCorner(
    baseStart,
    baseEnd,
    oppositeCorner
  );
  return shouldConnectOppositeCornerToBaseStart(
    baseStart,
    baseEnd,
    oppositeCorner
  )
    ? [baseStart, baseEnd, automaticCorner, oppositeCorner]
    : [baseStart, baseEnd, oppositeCorner, automaticCorner];
};
