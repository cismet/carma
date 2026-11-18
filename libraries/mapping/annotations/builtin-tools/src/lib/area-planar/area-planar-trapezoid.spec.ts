import {
  ecefFromGeographicCoordinate,
  geographicCoordinateFromEcef,
} from "@carma-geo/proj";
import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { type AnnotationGeographicCoordinate } from "@carma-mapping/annotations/core";

import {
  canPlaceAreaPlanarTrapezoidSecondPointOnHorizontalPlane,
  canPlaceAreaPlanarTrapezoidSecondPointWithinHorizontalLineMaxLength,
  resolveAreaPlanarTrapezoidMeasurementCoordinates,
  resolveNextAreaPlanarTrapezoidDraftCoordinates,
  shouldApplyAreaPlanarTrapezoidRightAngleLimiter,
} from "./area-planar-trapezoid";

const geographicCoordinate = (
  longitude: number,
  latitude: number,
  altitude = 100
): AnnotationGeographicCoordinate => ({
  longitude,
  latitude,
  altitude,
});

/** East/north/up frame at 7E 51N; `at` builds geographic coordinates from local offsets in metres. */
const createLocalFrame = () => {
  const anchor = ecefFromGeographicCoordinate({
    longitude: 7,
    latitude: 51,
    altitude: 100,
  });
  const up = anchor.clone().normalize();
  const east = new Vector3().crossVectors(new Vector3(0, 0, 1), up).normalize();
  const north = new Vector3().crossVectors(up, east).normalize();
  const position = (eastMeters: number, northMeters: number, upMeters = 0) =>
    anchor
      .clone()
      .addScaledVector(east, eastMeters)
      .addScaledVector(north, northMeters)
      .addScaledVector(up, upMeters);
  return {
    position,
    at: (eastMeters: number, northMeters: number, upMeters = 0) =>
      geographicCoordinateFromEcef(position(eastMeters, northMeters, upMeters)),
  };
};

const toPositions = (
  coordinates: readonly AnnotationGeographicCoordinate[] | null | undefined
) =>
  (coordinates ?? []).map((coordinate) =>
    ecefFromGeographicCoordinate(coordinate)
  );

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
    const first = createLocalFrame().at(0, 0);
    const nearSecond = geographicCoordinate(7.0001, 51, 100.05);
    const farSecond = geographicCoordinate(7.0001, 51, 100.25);
    const canPlace = (
      coordinate: AnnotationGeographicCoordinate,
      toleranceMeters: number
    ) =>
      canPlaceAreaPlanarTrapezoidSecondPointOnHorizontalPlane({
        coordinate,
        previousCoordinates: [first],
        toleranceMeters,
      });

    expect(canPlace(nearSecond, 0.1)).toBe(true);
    expect(canPlace(farSecond, 0.1)).toBe(false);
    expect(canPlace(farSecond, Number.POSITIVE_INFINITY)).toBe(true);
  });

  it("checks whether the second point stays within the local horizontal line length", () => {
    const frame = createLocalFrame();
    const first = frame.at(0, 0);
    const canPlace = (eastMeters: number, maxLengthMeters: number) =>
      canPlaceAreaPlanarTrapezoidSecondPointWithinHorizontalLineMaxLength({
        coordinate: frame.at(eastMeters, 0),
        previousCoordinates: [first],
        maxLengthMeters,
      });

    expect(canPlace(10, 20)).toBe(true);
    expect(canPlace(30, 20)).toBe(false);
    expect(canPlace(30, Number.POSITIVE_INFINITY)).toBe(true);
    expect(canPlace(10, 10.0001)).toBe(true);
    expect(canPlace(10, 9.9999)).toBe(false);
  });

  it("projects the second point onto the local horizontal helper plane", () => {
    const frame = createLocalFrame();
    const first = frame.at(0, 0);

    const nextCoordinates = resolveNextAreaPlanarTrapezoidDraftCoordinates({
      coordinate: frame.at(10, 0, 20),
      previousCoordinates: [first],
    });

    expect(nextCoordinates).toHaveLength(2);
    expect(
      canPlaceAreaPlanarTrapezoidSecondPointOnHorizontalPlane({
        coordinate: nextCoordinates![1]!,
        previousCoordinates: [first],
        toleranceMeters: 1e-6,
      })
    ).toBe(true);
  });

  describe("third point", () => {
    const frame = createLocalFrame();
    const previousCoordinates = [frame.at(0, 0), frame.at(10, 0)];
    const rawThirdPosition = frame.position(10.5, 10);
    const resolveThird = (limitersSuspended?: boolean) =>
      resolveNextAreaPlanarTrapezoidDraftCoordinates({
        coordinate: geographicCoordinateFromEcef(rawThirdPosition),
        previousCoordinates,
        thirdPointRightAngleToleranceDeg: 5,
        limitersSuspended,
      })![2]!;

    it("constrains near-right-angle third points into the plane orthogonal to the baseline", () => {
      const [baseStart, baseEnd] = toPositions(previousCoordinates);
      const baseVector = new Vector3().subVectors(baseEnd!, baseStart!);
      const connectingVector = new Vector3().subVectors(
        ecefFromGeographicCoordinate(resolveThird()),
        baseEnd!
      );

      expect(Math.abs(baseVector.dot(connectingVector))).toBeLessThan(1e-2);
    });

    it("keeps limiter-suspended third points outside the right-angle limiter", () => {
      expect(
        ecefFromGeographicCoordinate(resolveThird(true)).distanceTo(
          rawThirdPosition
        )
      ).toBeLessThan(1e-6);
    });
  });

  it("symmetrically shortens the parallel edge after the third point", () => {
    const draftCoordinates = [
      geographicCoordinate(7, 51),
      geographicCoordinate(7.0001, 51),
      geographicCoordinate(7.00008, 51.00008, 103),
    ];

    const measurementCoordinates =
      resolveAreaPlanarTrapezoidMeasurementCoordinates(draftCoordinates);
    const positions = toPositions(measurementCoordinates);
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
    const positions = toPositions(measurementCoordinates);
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
    const frame = createLocalFrame();

    const nextCoordinates = resolveNextAreaPlanarTrapezoidDraftCoordinates({
      coordinate: frame.at(1, 12, 9),
      previousCoordinates: [frame.at(0, 0), frame.at(10, 0), frame.at(8, 8, 3)],
    });
    const positions = toPositions(nextCoordinates);

    expect(positions).toHaveLength(4);
    expectParallel(
      new Vector3().subVectors(positions[1]!, positions[0]!),
      new Vector3().subVectors(positions[3]!, positions[2]!)
    );
  });

  it("constrains near-right-angle fourth points against the other baseline endpoint", () => {
    const frame = createLocalFrame();

    const nextCoordinates = resolveNextAreaPlanarTrapezoidDraftCoordinates({
      coordinate: frame.at(0.8, 8.5, 9),
      previousCoordinates: [
        frame.at(0, 0),
        frame.at(10, 0),
        frame.at(10, 8, 3),
      ],
      thirdPointRightAngleToleranceDeg: 6.5,
    });
    const positions = toPositions(nextCoordinates);

    expect(positions).toHaveLength(4);
    expectParallel(
      new Vector3().subVectors(positions[1]!, positions[0]!),
      new Vector3().subVectors(positions[3]!, positions[2]!)
    );
    expect(
      resolveBaseRatio(positions[0]!, positions[1]!, positions[3]!)
    ).toBeCloseTo(0, 6);
  });

  it("keeps accepted previous points unchanged while resolving the next point", () => {
    const frame = createLocalFrame();
    const previousCoordinates = [
      frame.at(0, 0),
      frame.at(10, 0),
      frame.at(10.5, 8),
    ];

    const nextCoordinates = resolveNextAreaPlanarTrapezoidDraftCoordinates({
      coordinate: frame.at(0.8, 8.5),
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
