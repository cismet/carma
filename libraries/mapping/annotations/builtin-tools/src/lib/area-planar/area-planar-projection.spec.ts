import { Cartesian3 } from "@carma-cesium";
import { describe, expect, it } from "vitest";
import {
  cartesian3FromGeographicCoordinate,
  geographicCoordinateFromCartesian3,
} from "@carma-mapping/engines/cesium/core";

import {
  AREA_PLANAR_PROJECTION_MODES,
  canResolveAreaPlanarProjectedPolygon,
  resolveAreaPlanarProjectedCoordinates,
} from "./area-planar-projection";

const offsetPosition = (
  anchor: Cartesian3,
  x: number,
  y: number,
  z: number
) =>
  Cartesian3.add(anchor, new Cartesian3(x, y, z), new Cartesian3());

describe("area planar projection", () => {
  it("projects auxiliary input points onto the measured planar contour", () => {
    const anchor = Cartesian3.fromDegrees(7, 51, 100);
    const samplePositions = [
      offsetPosition(anchor, 0, 0, 0),
      offsetPosition(anchor, 10, 0, 0),
      offsetPosition(anchor, 0, 10, 0),
      offsetPosition(anchor, 5, 5, 20),
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

  it("rejects samples whose projected polygon self-intersects on the active plane", () => {
    const anchor = Cartesian3.fromDegrees(7, 51, 100);
    const previousCoordinates = [
      offsetPosition(anchor, 0, 0, 0),
      offsetPosition(anchor, 10, 0, 0),
      offsetPosition(anchor, 0, 10, 0),
    ].map(geographicCoordinateFromCartesian3);
    const coordinates = [
      ...previousCoordinates,
      geographicCoordinateFromCartesian3(offsetPosition(anchor, 10, 10, 10)),
    ];

    expect(
      canResolveAreaPlanarProjectedPolygon({
        coordinates,
        previousCoordinates,
        mode: AREA_PLANAR_PROJECTION_MODES.PCA,
        maxPlaneNormalChangeDeg: null,
      })
    ).toBe(false);
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
