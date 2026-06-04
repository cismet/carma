import { Cartesian3 } from "@carma-cesium";
import { describe, expect, it } from "vitest";
import {
  type CesiumGeographicCoordinate,
  cartesian3FromGeographicCoordinate,
  geographicCoordinateFromCartesian3,
} from "@carma-mapping/engines/cesium/core";

import {
  canPlaceAreaPlanarTrapezoidSecondPointOnHorizontalPlane,
  canPlaceAreaPlanarTrapezoidSecondPointWithinHorizontalLineMaxLength,
  getAreaPlanarTrapezoidSecondPointHorizontalLineLengthMeters,
  getAreaPlanarTrapezoidSecondPointHorizontalPlaneDistanceMeters,
  resolveAreaPlanarTrapezoidDraftCoordinates,
  resolveAreaPlanarTrapezoidMeasurementCoordinates,
  resolveNextAreaPlanarTrapezoidDraftCoordinates,
  resolveAreaPlanarTrapezoidThirdPointRightAngleCoordinate,
  shouldApplyAreaPlanarTrapezoidRightAngleLimiter,
} from "./area-planar-trapezoid";

const offsetPosition = (anchor: Cartesian3, x: number, y: number, z: number) =>
  Cartesian3.add(anchor, new Cartesian3(x, y, z), new Cartesian3());

const geographicCoordinate = (
  longitude: number,
  latitude: number,
  altitude = 100
): CesiumGeographicCoordinate => ({
  longitude,
  latitude,
  altitude,
});

const expectParallel = (left: Cartesian3, right: Cartesian3) => {
  const cross = Cartesian3.cross(left, right, new Cartesian3());
  const denominator = Cartesian3.magnitude(left) * Cartesian3.magnitude(right);
  expect(Cartesian3.magnitude(cross) / denominator).toBeLessThan(1e-6);
};

const resolveBaseRatio = (
  baseStart: Cartesian3,
  baseEnd: Cartesian3,
  position: Cartesian3
) => {
  const baseVector = Cartesian3.subtract(baseEnd, baseStart, new Cartesian3());
  const positionDelta = Cartesian3.subtract(
    position,
    baseStart,
    new Cartesian3()
  );

  return (
    Cartesian3.dot(positionDelta, baseVector) /
    Cartesian3.magnitudeSquared(baseVector)
  );
};

describe("area planar trapezoid construction", () => {
  it("applies the right-angle limiter while adding third and fourth points", () => {
    expect(shouldApplyAreaPlanarTrapezoidRightAngleLimiter(0)).toBe(false);
    expect(shouldApplyAreaPlanarTrapezoidRightAngleLimiter(1)).toBe(false);
    expect(shouldApplyAreaPlanarTrapezoidRightAngleLimiter(2)).toBe(true);
    expect(shouldApplyAreaPlanarTrapezoidRightAngleLimiter(3)).toBe(true);
    expect(shouldApplyAreaPlanarTrapezoidRightAngleLimiter(4)).toBe(false);
  });

  it("checks whether the second point can be placed on the horizontal plane", () => {
    const anchor = Cartesian3.fromDegrees(7, 51, 100);
    const first = geographicCoordinateFromCartesian3(anchor);
    const nearSecond = geographicCoordinate(7.0001, 51, 100.05);
    const farSecond = geographicCoordinate(7.0001, 51, 100.25);

    expect(
      getAreaPlanarTrapezoidSecondPointHorizontalPlaneDistanceMeters({
        coordinate: nearSecond,
        previousCoordinates: [first],
      })
    ).toBeLessThan(0.1);
    expect(
      canPlaceAreaPlanarTrapezoidSecondPointOnHorizontalPlane({
        coordinate: nearSecond,
        previousCoordinates: [first],
        toleranceMeters: 0.1,
      })
    ).toBe(true);
    expect(
      canPlaceAreaPlanarTrapezoidSecondPointOnHorizontalPlane({
        coordinate: farSecond,
        previousCoordinates: [first],
        toleranceMeters: 0.1,
      })
    ).toBe(false);
    expect(
      canPlaceAreaPlanarTrapezoidSecondPointOnHorizontalPlane({
        coordinate: farSecond,
        previousCoordinates: [first],
        toleranceMeters: Number.POSITIVE_INFINITY,
      })
    ).toBe(true);
  });

  it("checks whether the second point stays within the local horizontal line length", () => {
    const anchor = Cartesian3.fromDegrees(7, 51, 100);
    const first = geographicCoordinateFromCartesian3(anchor);
    const localUp = Cartesian3.normalize(anchor, new Cartesian3());
    const localEast = Cartesian3.normalize(
      Cartesian3.cross(Cartesian3.UNIT_Z, localUp, new Cartesian3()),
      new Cartesian3()
    );
    const createSecondPoint = (horizontalOffsetMeters: number) =>
      geographicCoordinateFromCartesian3(
        Cartesian3.add(
          anchor,
          Cartesian3.multiplyByScalar(
            localEast,
            horizontalOffsetMeters,
            new Cartesian3()
          ),
          new Cartesian3()
        )
      );
    const nearSecond = createSecondPoint(10);
    const farSecond = createSecondPoint(30);

    expect(
      getAreaPlanarTrapezoidSecondPointHorizontalLineLengthMeters({
        coordinate: nearSecond,
        previousCoordinates: [first],
      })
    ).toBeCloseTo(10, 6);
    expect(
      canPlaceAreaPlanarTrapezoidSecondPointWithinHorizontalLineMaxLength({
        coordinate: nearSecond,
        previousCoordinates: [first],
        maxLengthMeters: 20,
      })
    ).toBe(true);
    expect(
      canPlaceAreaPlanarTrapezoidSecondPointWithinHorizontalLineMaxLength({
        coordinate: farSecond,
        previousCoordinates: [first],
        maxLengthMeters: 20,
      })
    ).toBe(false);
    expect(
      canPlaceAreaPlanarTrapezoidSecondPointWithinHorizontalLineMaxLength({
        coordinate: farSecond,
        previousCoordinates: [first],
        maxLengthMeters: Number.POSITIVE_INFINITY,
      })
    ).toBe(true);
  });

  it("projects the second point onto the local horizontal helper plane", () => {
    const anchor = Cartesian3.fromDegrees(7, 51, 100);
    const first = geographicCoordinateFromCartesian3(
      offsetPosition(anchor, 0, 0, 0)
    );
    const second = geographicCoordinateFromCartesian3(
      offsetPosition(anchor, 10, 0, 20)
    );

    const nextCoordinates = resolveNextAreaPlanarTrapezoidDraftCoordinates({
      coordinate: second,
      previousCoordinates: [first],
    });

    expect(nextCoordinates).toHaveLength(2);
    expect(
      getAreaPlanarTrapezoidSecondPointHorizontalPlaneDistanceMeters({
        coordinate: nextCoordinates![1]!,
        previousCoordinates: [first],
      })
    ).toBeLessThan(1e-6);
  });

  it("constrains near-right-angle third points into the plane orthogonal to the baseline", () => {
    const anchor = Cartesian3.fromDegrees(7, 51, 100);
    const localUp = Cartesian3.normalize(anchor, new Cartesian3());
    const localEast = Cartesian3.normalize(
      Cartesian3.cross(Cartesian3.UNIT_Z, localUp, new Cartesian3()),
      new Cartesian3()
    );
    const localNorth = Cartesian3.normalize(
      Cartesian3.cross(localUp, localEast, new Cartesian3()),
      new Cartesian3()
    );
    const baseStart = geographicCoordinateFromCartesian3(anchor);
    const baseEnd = geographicCoordinateFromCartesian3(
      Cartesian3.add(
        anchor,
        Cartesian3.multiplyByScalar(localEast, 10, new Cartesian3()),
        new Cartesian3()
      )
    );
    const rawThird = geographicCoordinateFromCartesian3(
      Cartesian3.add(
        anchor,
        Cartesian3.add(
          Cartesian3.multiplyByScalar(localEast, 10.5, new Cartesian3()),
          Cartesian3.multiplyByScalar(localNorth, 10, new Cartesian3()),
          new Cartesian3()
        ),
        new Cartesian3()
      )
    );

    const constrainedThird =
      resolveAreaPlanarTrapezoidThirdPointRightAngleCoordinate({
        coordinate: rawThird,
        previousCoordinates: [baseStart, baseEnd],
        toleranceDeg: 5,
      });
    const constrainedPosition =
      cartesian3FromGeographicCoordinate(constrainedThird);
    const baseVector = Cartesian3.subtract(
      cartesian3FromGeographicCoordinate(baseEnd),
      cartesian3FromGeographicCoordinate(baseStart),
      new Cartesian3()
    );
    const connectingVector = Cartesian3.subtract(
      constrainedPosition,
      cartesian3FromGeographicCoordinate(baseEnd),
      new Cartesian3()
    );

    expect(Math.abs(Cartesian3.dot(baseVector, connectingVector))).toBeLessThan(
      1e-2
    );
  });

  it("keeps force accepted third points outside the right-angle limiter", () => {
    const anchor = Cartesian3.fromDegrees(7, 51, 100);
    const localUp = Cartesian3.normalize(anchor, new Cartesian3());
    const localEast = Cartesian3.normalize(
      Cartesian3.cross(Cartesian3.UNIT_Z, localUp, new Cartesian3()),
      new Cartesian3()
    );
    const localNorth = Cartesian3.normalize(
      Cartesian3.cross(localUp, localEast, new Cartesian3()),
      new Cartesian3()
    );
    const baseStart = geographicCoordinateFromCartesian3(anchor);
    const baseEnd = geographicCoordinateFromCartesian3(
      Cartesian3.add(
        anchor,
        Cartesian3.multiplyByScalar(localEast, 10, new Cartesian3()),
        new Cartesian3()
      )
    );
    const rawThirdPosition = Cartesian3.add(
      anchor,
      Cartesian3.add(
        Cartesian3.multiplyByScalar(localEast, 10.5, new Cartesian3()),
        Cartesian3.multiplyByScalar(localNorth, 10, new Cartesian3()),
        new Cartesian3()
      ),
      new Cartesian3()
    );
    const rawThird = geographicCoordinateFromCartesian3(rawThirdPosition);

    const constrainedThird =
      resolveAreaPlanarTrapezoidThirdPointRightAngleCoordinate({
        coordinate: rawThird,
        previousCoordinates: [baseStart, baseEnd],
        toleranceDeg: 5,
        forceAccepted: true,
      });

    expect(
      Cartesian3.distance(
        cartesian3FromGeographicCoordinate(constrainedThird),
        rawThirdPosition
      )
    ).toBeLessThan(1e-6);
  });

  it("symmetrically shortens the parallel edge after the third point", () => {
    const draftCoordinates = [
      geographicCoordinate(7, 51),
      geographicCoordinate(7.0001, 51),
      geographicCoordinate(7.00008, 51.00008, 103),
    ];

    const measurementCoordinates =
      resolveAreaPlanarTrapezoidMeasurementCoordinates(draftCoordinates);
    const positions = measurementCoordinates.map(
      cartesian3FromGeographicCoordinate
    );
    const baseVector = Cartesian3.subtract(
      positions[1]!,
      positions[0]!,
      new Cartesian3()
    );
    const oppositeVector = Cartesian3.subtract(
      positions[2]!,
      positions[3]!,
      new Cartesian3()
    );

    expect(measurementCoordinates).toHaveLength(4);
    expectParallel(baseVector, oppositeVector);
    const thirdPointRatio = resolveBaseRatio(
      positions[0]!,
      positions[1]!,
      positions[2]!
    );
    const automaticPointRatio = resolveBaseRatio(
      positions[0]!,
      positions[1]!,
      positions[3]!
    );
    expect(thirdPointRatio).toBeGreaterThan(0.75);
    expect(thirdPointRatio).toBeLessThan(0.85);
    expect(automaticPointRatio).toBeCloseTo(1 - thirdPointRatio, 6);
  });

  it("connects the third point to the closer baseline endpoint", () => {
    const draftCoordinates = [
      geographicCoordinate(7, 51),
      geographicCoordinate(7.0001, 51),
      geographicCoordinate(7.00002, 51.00008, 103),
    ];

    const measurementCoordinates =
      resolveAreaPlanarTrapezoidMeasurementCoordinates(draftCoordinates);
    const positions = measurementCoordinates.map(
      cartesian3FromGeographicCoordinate
    );
    const baseVector = Cartesian3.subtract(
      positions[1]!,
      positions[0]!,
      new Cartesian3()
    );
    const oppositeVector = Cartesian3.subtract(
      positions[2]!,
      positions[3]!,
      new Cartesian3()
    );

    expect(measurementCoordinates).toHaveLength(4);
    expectParallel(baseVector, oppositeVector);
    const automaticPointRatio = resolveBaseRatio(
      positions[0]!,
      positions[1]!,
      positions[2]!
    );
    const thirdPointRatio = resolveBaseRatio(
      positions[0]!,
      positions[1]!,
      positions[3]!
    );
    expect(thirdPointRatio).toBeGreaterThan(0.15);
    expect(thirdPointRatio).toBeLessThan(0.25);
    expect(automaticPointRatio).toBeCloseTo(1 - thirdPointRatio, 6);
  });

  it("constrains the fourth point to the parallel guide line", () => {
    const anchor = Cartesian3.fromDegrees(7, 51, 100);
    const draftCoordinates = [
      offsetPosition(anchor, 0, 0, 0),
      offsetPosition(anchor, 10, 0, 0),
      offsetPosition(anchor, 8, 8, 3),
      offsetPosition(anchor, 1, 12, 9),
    ].map(geographicCoordinateFromCartesian3);

    const constrainedDraft =
      resolveAreaPlanarTrapezoidDraftCoordinates(draftCoordinates);
    const positions = constrainedDraft.map(cartesian3FromGeographicCoordinate);
    const baseVector = Cartesian3.subtract(
      positions[1]!,
      positions[0]!,
      new Cartesian3()
    );
    const oppositeVector = Cartesian3.subtract(
      positions[3]!,
      positions[2]!,
      new Cartesian3()
    );

    expect(constrainedDraft).toHaveLength(4);
    expectParallel(baseVector, oppositeVector);
  });

  it("constrains near-right-angle fourth points against the other baseline endpoint", () => {
    const anchor = Cartesian3.fromDegrees(7, 51, 100);
    const localUp = Cartesian3.normalize(anchor, new Cartesian3());
    const localEast = Cartesian3.normalize(
      Cartesian3.cross(Cartesian3.UNIT_Z, localUp, new Cartesian3()),
      new Cartesian3()
    );
    const localNorth = Cartesian3.normalize(
      Cartesian3.cross(localUp, localEast, new Cartesian3()),
      new Cartesian3()
    );
    const offsetLocal = (east: number, north: number, up: number) =>
      Cartesian3.add(
        anchor,
        Cartesian3.add(
          Cartesian3.add(
            Cartesian3.multiplyByScalar(localEast, east, new Cartesian3()),
            Cartesian3.multiplyByScalar(localNorth, north, new Cartesian3()),
            new Cartesian3()
          ),
          Cartesian3.multiplyByScalar(localUp, up, new Cartesian3()),
          new Cartesian3()
        ),
        new Cartesian3()
      );
    const previousCoordinates = [
      offsetLocal(0, 0, 0),
      offsetLocal(10, 0, 0),
      offsetLocal(10, 8, 3),
    ].map(geographicCoordinateFromCartesian3);
    const rawFourth = geographicCoordinateFromCartesian3(
      offsetLocal(0.8, 8.5, 9)
    );

    const nextCoordinates = resolveNextAreaPlanarTrapezoidDraftCoordinates({
      coordinate: rawFourth,
      previousCoordinates,
      thirdPointRightAngleToleranceDeg: 6.5,
    });
    const positions = nextCoordinates?.map(cartesian3FromGeographicCoordinate);
    expect(positions).toHaveLength(4);
    const baseVector = Cartesian3.subtract(
      positions![1]!,
      positions![0]!,
      new Cartesian3()
    );
    const oppositeVector = Cartesian3.subtract(
      positions![3]!,
      positions![2]!,
      new Cartesian3()
    );

    expectParallel(baseVector, oppositeVector);
    expect(
      resolveBaseRatio(positions![0]!, positions![1]!, positions![3]!)
    ).toBeCloseTo(0, 6);
  });
});
