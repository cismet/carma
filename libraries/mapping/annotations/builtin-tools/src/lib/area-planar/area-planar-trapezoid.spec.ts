import { Cartesian3 } from "@carma-cesium";
import { describe, expect, it } from "vitest";
import {
  type CesiumGeographicCoordinate,
  cartesian3FromGeographicCoordinate,
  geographicCoordinateFromCartesian3,
} from "@carma-mapping/engines/cesium/core";

import {
  resolveAreaPlanarTrapezoidDraftCoordinates,
  resolveAreaPlanarTrapezoidMeasurementCoordinates,
  resolveNextAreaPlanarTrapezoidDraftCoordinates,
} from "./area-planar-trapezoid";

const offsetPosition = (
  anchor: Cartesian3,
  x: number,
  y: number,
  z: number
) => Cartesian3.add(anchor, new Cartesian3(x, y, z), new Cartesian3());

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
  it("constrains the second point to the first point altitude", () => {
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
    expect(nextCoordinates?.[1]?.altitude).toBeCloseTo(first.altitude, 6);
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
});
