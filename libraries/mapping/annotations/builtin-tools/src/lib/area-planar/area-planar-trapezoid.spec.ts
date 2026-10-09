import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  ecefFromGeographicCoordinate,
  geographicCoordinateFromEcef,
  type AnnotationGeographicCoordinate,
} from "@carma-mapping/annotations/core";

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

const offsetPosition = (anchor: Vector3, x: number, y: number, z: number) =>
  anchor.clone().add(new Vector3(x, y, z));

const geographicCoordinate = (
  longitude: number,
  latitude: number,
  altitude = 100
): AnnotationGeographicCoordinate => ({
  longitude,
  latitude,
  altitude,
});

const expectParallel = (left: Vector3, right: Vector3) => {
  const cross = new Vector3().crossVectors(left, right);
  const denominator = left.length() * right.length();
  expect(cross.length() / denominator).toBeLessThan(1e-6);
};

const resolveBaseRatio = (
  baseStart: Vector3,
  baseEnd: Vector3,
  position: Vector3
) => {
  const baseVector = new Vector3().subVectors(baseEnd, baseStart);
  const positionDelta = new Vector3().subVectors(position, baseStart);

  return positionDelta.dot(baseVector) / baseVector.lengthSq();
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
    const anchor = ecefFromGeographicCoordinate({
      longitude: 7,
      latitude: 51,
      altitude: 100,
    });
    const first = geographicCoordinateFromEcef(anchor);
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
    const anchor = ecefFromGeographicCoordinate({
      longitude: 7,
      latitude: 51,
      altitude: 100,
    });
    const first = geographicCoordinateFromEcef(anchor);
    const localUp = anchor.clone().normalize();
    const localEast = new Vector3()
      .crossVectors(new Vector3(0, 0, 1), localUp)
      .normalize();
    const createSecondPoint = (horizontalOffsetMeters: number) =>
      geographicCoordinateFromEcef(
        anchor
          .clone()
          .add(localEast.clone().multiplyScalar(horizontalOffsetMeters))
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
    const anchor = ecefFromGeographicCoordinate({
      longitude: 7,
      latitude: 51,
      altitude: 100,
    });
    const first = geographicCoordinateFromEcef(offsetPosition(anchor, 0, 0, 0));
    const second = geographicCoordinateFromEcef(
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
    const anchor = ecefFromGeographicCoordinate({
      longitude: 7,
      latitude: 51,
      altitude: 100,
    });
    const localUp = anchor.clone().normalize();
    const localEast = new Vector3()
      .crossVectors(new Vector3(0, 0, 1), localUp)
      .normalize();
    const localNorth = new Vector3()
      .crossVectors(localUp, localEast)
      .normalize();
    const baseStart = geographicCoordinateFromEcef(anchor);
    const baseEnd = geographicCoordinateFromEcef(
      anchor.clone().add(localEast.clone().multiplyScalar(10))
    );
    const rawThird = geographicCoordinateFromEcef(
      anchor
        .clone()
        .add(
          localEast
            .clone()
            .multiplyScalar(10.5)
            .add(localNorth.clone().multiplyScalar(10))
        )
    );

    const constrainedThird =
      resolveAreaPlanarTrapezoidThirdPointRightAngleCoordinate({
        coordinate: rawThird,
        previousCoordinates: [baseStart, baseEnd],
        toleranceDeg: 5,
      });
    const constrainedPosition = ecefFromGeographicCoordinate(constrainedThird);
    const baseVector = new Vector3().subVectors(
      ecefFromGeographicCoordinate(baseEnd),
      ecefFromGeographicCoordinate(baseStart)
    );
    const connectingVector = new Vector3().subVectors(
      constrainedPosition,
      ecefFromGeographicCoordinate(baseEnd)
    );

    expect(Math.abs(baseVector.dot(connectingVector))).toBeLessThan(1e-2);
  });

  it("keeps limiter-suspended third points outside the right-angle limiter", () => {
    const anchor = ecefFromGeographicCoordinate({
      longitude: 7,
      latitude: 51,
      altitude: 100,
    });
    const localUp = anchor.clone().normalize();
    const localEast = new Vector3()
      .crossVectors(new Vector3(0, 0, 1), localUp)
      .normalize();
    const localNorth = new Vector3()
      .crossVectors(localUp, localEast)
      .normalize();
    const baseStart = geographicCoordinateFromEcef(anchor);
    const baseEnd = geographicCoordinateFromEcef(
      anchor.clone().add(localEast.clone().multiplyScalar(10))
    );
    const rawThirdPosition = anchor
      .clone()
      .add(
        localEast
          .clone()
          .multiplyScalar(10.5)
          .add(localNorth.clone().multiplyScalar(10))
      );
    const rawThird = geographicCoordinateFromEcef(rawThirdPosition);

    const constrainedThird =
      resolveAreaPlanarTrapezoidThirdPointRightAngleCoordinate({
        coordinate: rawThird,
        previousCoordinates: [baseStart, baseEnd],
        toleranceDeg: 5,
        limitersSuspended: true,
      });

    expect(
      ecefFromGeographicCoordinate(constrainedThird).distanceTo(
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
    const positions = measurementCoordinates.map((coordinate) =>
      ecefFromGeographicCoordinate(coordinate)
    );
    const baseVector = new Vector3().subVectors(positions[1]!, positions[0]!);
    const oppositeVector = new Vector3().subVectors(
      positions[2]!,
      positions[3]!
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
    const positions = measurementCoordinates.map((coordinate) =>
      ecefFromGeographicCoordinate(coordinate)
    );
    const baseVector = new Vector3().subVectors(positions[1]!, positions[0]!);
    const oppositeVector = new Vector3().subVectors(
      positions[2]!,
      positions[3]!
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
    const anchor = ecefFromGeographicCoordinate({
      longitude: 7,
      latitude: 51,
      altitude: 100,
    });
    const draftCoordinates = [
      offsetPosition(anchor, 0, 0, 0),
      offsetPosition(anchor, 10, 0, 0),
      offsetPosition(anchor, 8, 8, 3),
      offsetPosition(anchor, 1, 12, 9),
    ].map(geographicCoordinateFromEcef);

    const constrainedDraft =
      resolveAreaPlanarTrapezoidDraftCoordinates(draftCoordinates);
    const positions = constrainedDraft.map((coordinate) =>
      ecefFromGeographicCoordinate(coordinate)
    );
    const baseVector = new Vector3().subVectors(positions[1]!, positions[0]!);
    const oppositeVector = new Vector3().subVectors(
      positions[3]!,
      positions[2]!
    );

    expect(constrainedDraft).toHaveLength(4);
    expectParallel(baseVector, oppositeVector);
  });

  it("constrains near-right-angle fourth points against the other baseline endpoint", () => {
    const anchor = ecefFromGeographicCoordinate({
      longitude: 7,
      latitude: 51,
      altitude: 100,
    });
    const localUp = anchor.clone().normalize();
    const localEast = new Vector3()
      .crossVectors(new Vector3(0, 0, 1), localUp)
      .normalize();
    const localNorth = new Vector3()
      .crossVectors(localUp, localEast)
      .normalize();
    const offsetLocal = (east: number, north: number, up: number) =>
      anchor
        .clone()
        .add(
          localEast
            .clone()
            .multiplyScalar(east)
            .add(localNorth.clone().multiplyScalar(north))
            .add(localUp.clone().multiplyScalar(up))
        );
    const previousCoordinates = [
      offsetLocal(0, 0, 0),
      offsetLocal(10, 0, 0),
      offsetLocal(10, 8, 3),
    ].map(geographicCoordinateFromEcef);
    const rawFourth = geographicCoordinateFromEcef(offsetLocal(0.8, 8.5, 9));

    const nextCoordinates = resolveNextAreaPlanarTrapezoidDraftCoordinates({
      coordinate: rawFourth,
      previousCoordinates,
      thirdPointRightAngleToleranceDeg: 6.5,
    });
    const positions = nextCoordinates?.map((coordinate) =>
      ecefFromGeographicCoordinate(coordinate)
    );
    expect(positions).toHaveLength(4);
    const baseVector = new Vector3().subVectors(positions![1]!, positions![0]!);
    const oppositeVector = new Vector3().subVectors(
      positions![3]!,
      positions![2]!
    );

    expectParallel(baseVector, oppositeVector);
    expect(
      resolveBaseRatio(positions![0]!, positions![1]!, positions![3]!)
    ).toBeCloseTo(0, 6);
  });

  it("keeps accepted previous points unchanged while resolving the next point", () => {
    const anchor = ecefFromGeographicCoordinate({
      longitude: 7,
      latitude: 51,
      altitude: 100,
    });
    const localUp = anchor.clone().normalize();
    const localEast = new Vector3()
      .crossVectors(new Vector3(0, 0, 1), localUp)
      .normalize();
    const localNorth = new Vector3()
      .crossVectors(localUp, localEast)
      .normalize();
    const offsetLocal = (east: number, north: number, up: number) =>
      anchor
        .clone()
        .add(
          localEast
            .clone()
            .multiplyScalar(east)
            .add(localNorth.clone().multiplyScalar(north))
            .add(localUp.clone().multiplyScalar(up))
        );
    const previousCoordinates = [
      offsetLocal(0, 0, 0),
      offsetLocal(10, 0, 0),
      offsetLocal(10.5, 8, 0),
    ].map(geographicCoordinateFromEcef);
    const rawFourth = geographicCoordinateFromEcef(offsetLocal(0.8, 8.5, 0));

    const nextCoordinates = resolveNextAreaPlanarTrapezoidDraftCoordinates({
      coordinate: rawFourth,
      previousCoordinates,
      thirdPointRightAngleToleranceDeg: 6.5,
    });

    expect(nextCoordinates).toHaveLength(4);
    expect(
      ecefFromGeographicCoordinate(nextCoordinates![2]!).distanceTo(
        ecefFromGeographicCoordinate(previousCoordinates[2]!)
      )
    ).toBeLessThan(1e-6);
  });
});
