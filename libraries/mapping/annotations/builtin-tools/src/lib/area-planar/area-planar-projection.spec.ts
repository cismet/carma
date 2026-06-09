import { Cartesian3 } from "@carma-cesium";
import { describe, expect, it } from "vitest";
import {
  cartesian3FromGeographicCoordinate,
  geographicCoordinateFromCartesian3,
} from "@carma-mapping/engines/cesium/core";

import {
  AREA_PLANAR_PROJECTION_MODES,
  canAppendAreaPlanarProjectedPoint,
  canResolveAreaPlanarProjectedPolygon,
  resolveAreaPlanarProjectedAppendPreview,
  resolveAreaPlanarProjectedCoordinates,
} from "./area-planar-projection";

const offsetPosition = (
  anchor: Cartesian3,
  x: number,
  y: number,
  z: number
) =>
  Cartesian3.add(anchor, new Cartesian3(x, y, z), new Cartesian3());

const expectCoordinatesNearPositions = (
  coordinates: readonly ReturnType<typeof geographicCoordinateFromCartesian3>[],
  positions: readonly Cartesian3[]
) => {
  expect(coordinates).toHaveLength(positions.length);
  coordinates.forEach((coordinate, index) => {
    expect(
      Cartesian3.distance(
        cartesian3FromGeographicCoordinate(coordinate),
        positions[index]!
      )
    ).toBeLessThan(1e-5);
  });
};

describe("area planar projection", () => {
  it("projects auxiliary input points onto the measured planar contour", () => {
    const anchor = Cartesian3.fromDegrees(7, 51, 100);
    const samplePositions = [
      offsetPosition(anchor, 0, 0, 0),
      offsetPosition(anchor, 10, 0, 0),
      offsetPosition(anchor, 0, 10, 0),
      offsetPosition(anchor, 5, 4, 20),
    ];

    const projectedCoordinates = resolveAreaPlanarProjectedCoordinates({
      coordinates: samplePositions.map(geographicCoordinateFromCartesian3),
      mode: AREA_PLANAR_PROJECTION_MODES.FIRST_NON_COLLINEAR_TRIANGLE,
    });

    expect(projectedCoordinates).not.toBeNull();
    expect(projectedCoordinates).toHaveLength(samplePositions.length);

    const projectedLast = cartesian3FromGeographicCoordinate(
      projectedCoordinates![3]!
    );
    expect(Cartesian3.distance(projectedLast, samplePositions[3]!)).toBeCloseTo(
      20,
      1
    );
    expect(projectedLast.z).toBeCloseTo(samplePositions[0]!.z, 6);
  });

  it("rejects samples that cannot resolve a measurement plane", () => {
    const anchor = Cartesian3.fromDegrees(7, 51, 100);
    const coordinates = [
      offsetPosition(anchor, 0, 0, 0),
      offsetPosition(anchor, 10, 0, 0),
      offsetPosition(anchor, 20, 0, 0),
    ].map(geographicCoordinateFromCartesian3);

    expect(
      resolveAreaPlanarProjectedCoordinates({
        coordinates,
        mode: AREA_PLANAR_PROJECTION_MODES.FIRST_NON_COLLINEAR_TRIANGLE,
      })
    ).toBeNull();
    expect(
      canResolveAreaPlanarProjectedPolygon({
        coordinates,
        mode: AREA_PLANAR_PROJECTION_MODES.FIRST_NON_COLLINEAR_TRIANGLE,
      })
    ).toBe(false);
  });

  it("allows bowtie append lines while keeping fill on the last valid prefix", () => {
    const anchor = Cartesian3.fromDegrees(7, 51, 100);
    const previousPositions = [
      offsetPosition(anchor, 0, 0, 0),
      offsetPosition(anchor, 10, 0, 0),
      offsetPosition(anchor, 10, 10, 0),
    ];
    const previousCoordinates = previousPositions.map(
      geographicCoordinateFromCartesian3
    );
    const coordinates = [
      ...previousCoordinates,
      geographicCoordinateFromCartesian3(offsetPosition(anchor, 3, -2, 0)),
    ];

    expect(
      canAppendAreaPlanarProjectedPoint({
        coordinates,
        previousCoordinates,
        mode: AREA_PLANAR_PROJECTION_MODES.FIRST_NON_COLLINEAR_TRIANGLE,
        maxPlaneNormalChangeDeg: null,
      })
    ).toBe(true);
    expect(
      canResolveAreaPlanarProjectedPolygon({
        coordinates,
        previousCoordinates,
        mode: AREA_PLANAR_PROJECTION_MODES.FIRST_NON_COLLINEAR_TRIANGLE,
        maxPlaneNormalChangeDeg: null,
      })
    ).toBe(false);

    const preview = resolveAreaPlanarProjectedAppendPreview({
      coordinates,
      previousCoordinates,
      mode: AREA_PLANAR_PROJECTION_MODES.FIRST_NON_COLLINEAR_TRIANGLE,
      maxPlaneNormalChangeDeg: null,
    });

    expect(preview?.lineCoordinates).toHaveLength(4);
    expect(preview?.fillCoordinateRings).toHaveLength(1);
    expectCoordinatesNearPositions(
      preview?.fillCoordinates ?? [],
      previousPositions
    );
  });

  it("allows appending a point when only the virtual close segment intersects", () => {
    const anchor = Cartesian3.fromDegrees(7, 51, 100);
    const previousCoordinates = [
      offsetPosition(anchor, 0, 0, 0),
      offsetPosition(anchor, 10, 0, 0),
      offsetPosition(anchor, 0, 10, 0),
    ].map(geographicCoordinateFromCartesian3);
    const coordinates = [
      ...previousCoordinates,
      geographicCoordinateFromCartesian3(offsetPosition(anchor, 10, 10, 0)),
    ];

    expect(
      canAppendAreaPlanarProjectedPoint({
        coordinates,
        previousCoordinates,
        mode: AREA_PLANAR_PROJECTION_MODES.FIRST_NON_COLLINEAR_TRIANGLE,
        maxPlaneNormalChangeDeg: null,
      })
    ).toBe(true);
    expect(
      canResolveAreaPlanarProjectedPolygon({
        coordinates,
        previousCoordinates,
        mode: AREA_PLANAR_PROJECTION_MODES.FIRST_NON_COLLINEAR_TRIANGLE,
        maxPlaneNormalChangeDeg: null,
      })
    ).toBe(false);

    const preview = resolveAreaPlanarProjectedAppendPreview({
      coordinates,
      previousCoordinates,
      mode: AREA_PLANAR_PROJECTION_MODES.FIRST_NON_COLLINEAR_TRIANGLE,
      maxPlaneNormalChangeDeg: null,
    });

    expect(preview?.lineCoordinates).toHaveLength(4);
    expect(preview?.fillCoordinateRings).toHaveLength(1);
    expectCoordinatesNearPositions(
      preview?.fillCoordinates ?? [],
      previousCoordinates.map(cartesian3FromGeographicCoordinate)
    );

    const acceptedAppendixPreview = resolveAreaPlanarProjectedAppendPreview({
      coordinates,
      previousCoordinates: coordinates,
      mode: AREA_PLANAR_PROJECTION_MODES.FIRST_NON_COLLINEAR_TRIANGLE,
      maxPlaneNormalChangeDeg: null,
    });

    expect(acceptedAppendixPreview?.lineCoordinates).toHaveLength(4);
    expect(acceptedAppendixPreview?.fillCoordinateRings).toHaveLength(1);
    expectCoordinatesNearPositions(
      acceptedAppendixPreview?.fillCoordinates ?? [],
      previousCoordinates.map(cartesian3FromGeographicCoordinate)
    );

    const recoveredCoordinates = [
      ...coordinates,
      geographicCoordinateFromCartesian3(offsetPosition(anchor, -5, 15, 0)),
    ];

    expect(
      canAppendAreaPlanarProjectedPoint({
        coordinates: recoveredCoordinates,
        previousCoordinates: coordinates,
        mode: AREA_PLANAR_PROJECTION_MODES.FIRST_NON_COLLINEAR_TRIANGLE,
        maxPlaneNormalChangeDeg: null,
      })
    ).toBe(true);
    expect(
      resolveAreaPlanarProjectedCoordinates({
        coordinates: recoveredCoordinates,
        mode: AREA_PLANAR_PROJECTION_MODES.FIRST_NON_COLLINEAR_TRIANGLE,
      })
    ).not.toBeNull();

    const recoveredPreview = resolveAreaPlanarProjectedAppendPreview({
      coordinates: recoveredCoordinates,
      previousCoordinates: coordinates,
      mode: AREA_PLANAR_PROJECTION_MODES.FIRST_NON_COLLINEAR_TRIANGLE,
      maxPlaneNormalChangeDeg: null,
    });

    expect(recoveredPreview?.lineCoordinates).toHaveLength(5);
    expect(recoveredPreview?.fillCoordinates).toHaveLength(5);
    expect(recoveredPreview?.fillCoordinateRings).toHaveLength(1);
  });

  it("closes a pending appendix tail back to the last valid prefix point", () => {
    const anchor = Cartesian3.fromDegrees(7, 51, 100);
    const positions = [
      offsetPosition(anchor, 0, 0, 0),
      offsetPosition(anchor, 4, 0, 0),
      offsetPosition(anchor, 4, 4, 0),
      offsetPosition(anchor, 8, 2, 0),
      offsetPosition(anchor, 8, 6, 0),
    ];
    const coordinates = positions.map(geographicCoordinateFromCartesian3);
    const previousCoordinates = coordinates.slice(0, -1);

    expect(
      canAppendAreaPlanarProjectedPoint({
        coordinates,
        previousCoordinates,
        mode: AREA_PLANAR_PROJECTION_MODES.FIRST_NON_COLLINEAR_TRIANGLE,
        maxPlaneNormalChangeDeg: null,
      })
    ).toBe(true);
    expect(
      resolveAreaPlanarProjectedCoordinates({
        coordinates,
        mode: AREA_PLANAR_PROJECTION_MODES.FIRST_NON_COLLINEAR_TRIANGLE,
      })
    ).toBeNull();

    const preview = resolveAreaPlanarProjectedAppendPreview({
      coordinates,
      previousCoordinates,
      mode: AREA_PLANAR_PROJECTION_MODES.FIRST_NON_COLLINEAR_TRIANGLE,
      maxPlaneNormalChangeDeg: null,
    });

    expect(preview?.lineCoordinates).toHaveLength(5);
    expect(preview?.fillCoordinateRings).toHaveLength(2);
    expectCoordinatesNearPositions(preview?.fillCoordinateRings?.[0] ?? [], [
      positions[0]!,
      positions[1]!,
      positions[2]!,
    ]);
    expectCoordinatesNearPositions(preview?.fillCoordinateRings?.[1] ?? [], [
      positions[2]!,
      positions[3]!,
      positions[4]!,
    ]);
  });

  it("does not create append previews for retraced edges", () => {
    const anchor = Cartesian3.fromDegrees(7, 51, 100);
    const previousCoordinates = [
      offsetPosition(anchor, 0, 0, 0),
      offsetPosition(anchor, 10, 0, 0),
      offsetPosition(anchor, 10, 10, 0),
    ].map(geographicCoordinateFromCartesian3);
    const coordinates = [
      ...previousCoordinates,
      geographicCoordinateFromCartesian3(offsetPosition(anchor, 10, 0, 0)),
    ];

    expect(
      canAppendAreaPlanarProjectedPoint({
        coordinates,
        previousCoordinates,
        mode: AREA_PLANAR_PROJECTION_MODES.FIRST_NON_COLLINEAR_TRIANGLE,
        maxPlaneNormalChangeDeg: null,
      })
    ).toBe(false);
    expect(
      resolveAreaPlanarProjectedAppendPreview({
        coordinates,
        previousCoordinates,
        mode: AREA_PLANAR_PROJECTION_MODES.FIRST_NON_COLLINEAR_TRIANGLE,
        maxPlaneNormalChangeDeg: null,
      })
    ).toBeNull();
  });

  it("rejects samples that tilt the resolved plane normal beyond the configured limit", () => {
    const anchor = Cartesian3.fromDegrees(7, 51, 100);
    const previousCoordinates = [
      offsetPosition(anchor, 0, 0, 0),
      offsetPosition(anchor, 10, 0, 0),
      offsetPosition(anchor, 0, 10, 0),
    ].map(geographicCoordinateFromCartesian3);
    const coordinates = [
      ...previousCoordinates,
      geographicCoordinateFromCartesian3(offsetPosition(anchor, 0, 0, 10)),
    ];

    expect(
      canResolveAreaPlanarProjectedPolygon({
        coordinates,
        previousCoordinates,
        mode: AREA_PLANAR_PROJECTION_MODES.BIGGEST_TRIANGLE,
        maxPlaneNormalChangeDeg: 5,
      })
    ).toBe(false);
    expect(
      canResolveAreaPlanarProjectedPolygon({
        coordinates,
        previousCoordinates,
        mode: AREA_PLANAR_PROJECTION_MODES.BIGGEST_TRIANGLE,
        maxPlaneNormalChangeDeg: 60,
      })
    ).toBe(true);
  });
});
