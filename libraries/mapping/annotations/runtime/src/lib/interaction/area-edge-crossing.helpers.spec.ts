import { Cartesian3, EllipsoidTangentPlane } from "@carma-cesium";
import { describe, expect, it } from "vitest";
import { geographicCoordinateFromCartesian3 } from "@carma-mapping/engines/cesium/core";

import {
  AREA_EDGE_CROSSING_PROJECTION_MODES,
  canAppendAreaPointWithoutActualEdgeCrossing,
  hasActualAreaEdgeCrossing,
} from "./area-edge-crossing.helpers";

const offsetPosition = (anchor: Cartesian3, x: number, y: number) => {
  const tangentPlane = new EllipsoidTangentPlane(anchor);
  const eastOffset = Cartesian3.multiplyByScalar(
    tangentPlane.xAxis,
    x,
    new Cartesian3()
  );
  const northOffset = Cartesian3.multiplyByScalar(
    tangentPlane.yAxis,
    y,
    new Cartesian3()
  );

  return Cartesian3.add(
    anchor,
    Cartesian3.add(eastOffset, northOffset, new Cartesian3()),
    new Cartesian3()
  );
};

const createCoordinates = (offsets: readonly (readonly [number, number])[]) => {
  const anchor = Cartesian3.fromDegrees(7, 51, 100);
  return offsets.map(([x, y]) =>
    geographicCoordinateFromCartesian3(offsetPosition(anchor, x, y))
  );
};

describe("area-edge-crossing helpers", () => {
  it("rejects appending a point when the new actual edge crosses an older edge", () => {
    const previousCoordinates = createCoordinates([
      [0, 0],
      [0, 10],
      [10, 0],
    ]);
    const nextCoordinates = [
      ...previousCoordinates,
      ...createCoordinates([[-5, 5]]),
    ];

    expect(
      canAppendAreaPointWithoutActualEdgeCrossing({
        previousCoordinates,
        nextCoordinates,
      })
    ).toBe(false);
  });

  it("allows appending a point when only the preliminary close edge would cross", () => {
    const previousCoordinates = createCoordinates([
      [0, 0],
      [10, 0],
      [0, 10],
    ]);
    const nextCoordinates = [
      ...previousCoordinates,
      ...createCoordinates([[10, 10]]),
    ];

    expect(
      canAppendAreaPointWithoutActualEdgeCrossing({
        previousCoordinates,
        nextCoordinates,
      })
    ).toBe(true);
  });

  it("rejects appending a point in ground geodesic projection mode", () => {
    const previousCoordinates = createCoordinates([
      [0, 0],
      [0, 10],
      [10, 0],
    ]);
    const nextCoordinates = [
      ...previousCoordinates,
      ...createCoordinates([[-5, 5]]),
    ];

    expect(
      canAppendAreaPointWithoutActualEdgeCrossing({
        previousCoordinates,
        nextCoordinates,
        projectionMode: AREA_EDGE_CROSSING_PROJECTION_MODES.GROUND_GEODESIC,
      })
    ).toBe(false);
  });

  it("rejects retraced actual edges", () => {
    const coordinates = createCoordinates([
      [0, 0],
      [10, 0],
      [10, 10],
      [6, 0],
      [2, 0],
    ]);

    expect(
      hasActualAreaEdgeCrossing({
        coordinates,
        firstCheckedEdgeIndex: 3,
      })
    ).toBe(true);
  });

  it("allows a new edge to touch an older edge at a single point", () => {
    const previousCoordinates = createCoordinates([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
    const nextCoordinates = [
      ...previousCoordinates,
      ...createCoordinates([[0, 0]]),
    ];

    expect(
      canAppendAreaPointWithoutActualEdgeCrossing({
        previousCoordinates,
        nextCoordinates,
      })
    ).toBe(true);
  });
});
