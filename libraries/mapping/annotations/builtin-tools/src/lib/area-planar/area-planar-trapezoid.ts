import { Cartesian3 } from "@carma-cesium";
import type { CesiumGeographicCoordinate } from "@carma-mapping/annotations/runtime";
import {
  cartesian3FromGeographicCoordinate,
  geographicCoordinateFromCartesian3,
} from "@carma-mapping/engines/cesium/core";

const constrainToAltitude = (
  coordinate: CesiumGeographicCoordinate,
  altitude: number
): CesiumGeographicCoordinate => ({
  ...coordinate,
  altitude,
});

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
    Cartesian3.multiplyByScalar(
      baseVector,
      oppositeRatio,
      new Cartesian3()
    ),
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

export const resolveAreaPlanarTrapezoidDraftCoordinates = (
  coordinates: readonly CesiumGeographicCoordinate[]
): readonly CesiumGeographicCoordinate[] => {
  if (coordinates.length < 2) {
    return coordinates;
  }

  const baseStart = coordinates[0]!;
  const baseEnd = constrainToAltitude(coordinates[1]!, baseStart.altitude);
  if (coordinates.length < 4) {
    return [baseStart, baseEnd, ...coordinates.slice(2, 3)];
  }

  const oppositeCorner = coordinates[2]!;
  return [
    baseStart,
    baseEnd,
    oppositeCorner,
    constrainToParallelLine(baseStart, baseEnd, oppositeCorner, coordinates[3]!),
  ];
};

export const resolveNextAreaPlanarTrapezoidDraftCoordinates = ({
  coordinate,
  previousCoordinates,
}: {
  coordinate: CesiumGeographicCoordinate;
  previousCoordinates: readonly CesiumGeographicCoordinate[];
}): readonly CesiumGeographicCoordinate[] | null =>
  previousCoordinates.length >= 4
    ? null
    : resolveAreaPlanarTrapezoidDraftCoordinates([
        ...previousCoordinates,
        coordinate,
      ]);

export const resolveAreaPlanarTrapezoidMeasurementCoordinates = (
  coordinates: readonly CesiumGeographicCoordinate[]
): readonly CesiumGeographicCoordinate[] => {
  const draftCoordinates = resolveAreaPlanarTrapezoidDraftCoordinates(
    coordinates
  );
  if (draftCoordinates.length !== 3) {
    return draftCoordinates.slice(0, 4);
  }

  const [baseStart, baseEnd, oppositeCorner] = draftCoordinates;
  return [
    baseStart!,
    baseEnd!,
    oppositeCorner!,
    createAutomaticSymmetricParallelCorner(
      baseStart!,
      baseEnd!,
      oppositeCorner!
    ),
  ];
};
