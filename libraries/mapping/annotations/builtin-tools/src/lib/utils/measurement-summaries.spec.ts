import { Cartesian3 } from "@carma-cesium";
import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import { cartesian3FromGeographicCoordinate } from "@carma-mapping/engines/cesium/core";
import type {
  CesiumGeographicCoordinate,
  StoredAnnotation,
} from "@carma-mapping/annotations/runtime";
import { describe, expect, it } from "vitest";

import {
  resolveAreaMeasurementSummary,
  resolvePolylineMeasurementSummary,
} from "./measurement-summaries";

const buildCoordinate = (
  overrides: Partial<CesiumGeographicCoordinate>
): CesiumGeographicCoordinate => ({
  latitude: 51,
  longitude: 7,
  altitude: 100,
  ...overrides,
});

const buildAreaAnnotation = (
  overrides: Partial<StoredAnnotation> = {}
): StoredAnnotation =>
  ({
    id: "area-1",
    toolType: ANNOTATION_TYPES.AREA_GROUND,
    nodeIds: ["node-1", "node-2", "node-3"],
    closed: true,
    ...overrides,
  } as StoredAnnotation);

describe("measurement summaries", () => {
  it("returns null for polyline summaries with fewer than two coordinates", () => {
    expect(resolvePolylineMeasurementSummary([buildCoordinate({})])).toBeNull();
  });

  it("keeps flat polyline elevation summaries at zero", () => {
    const summary = resolvePolylineMeasurementSummary([
      buildCoordinate({}),
      buildCoordinate({ latitude: 51.0001, longitude: 7.0001 }),
      buildCoordinate({ latitude: 51.0002, longitude: 7.0002 }),
    ]);

    expect(summary).not.toBeNull();
    expect(summary?.segmentCount).toBe(2);
    expect(summary?.ascentMeters).toBe(0);
    expect(summary?.descentMeters).toBe(0);
    expect(summary?.totalAbsoluteElevationChangeMeters).toBe(0);
    expect(summary?.startEndElevationDeltaMeters).toBe(0);
  });

  it("accumulates polyline ascent and descent independently", () => {
    const summary = resolvePolylineMeasurementSummary([
      buildCoordinate({ altitude: 100 }),
      buildCoordinate({ latitude: 51.0001, longitude: 7.0001, altitude: 130 }),
      buildCoordinate({ latitude: 51.0002, longitude: 7.0002, altitude: 120 }),
    ]);

    expect(summary).not.toBeNull();
    expect(summary?.ascentMeters).toBe(30);
    expect(summary?.descentMeters).toBe(10);
    expect(summary?.totalAbsoluteElevationChangeMeters).toBe(40);
    expect(summary?.startEndElevationDeltaMeters).toBe(20);
  });

  it("returns zero area for area summaries with fewer than three coordinates", () => {
    const summary = resolveAreaMeasurementSummary({
      annotation: buildAreaAnnotation(),
      toolType: ANNOTATION_TYPES.AREA_GROUND,
      coordinates: [
        buildCoordinate({}),
        buildCoordinate({ latitude: 51.0001, longitude: 7.0001 }),
      ],
    });

    expect(summary.areaSquareMeters).toBe(0);
    expect(summary.perimeterMeters).toBeGreaterThan(0);
  });

  it("includes the closing segment in area perimeters", () => {
    const coordinates = [
      buildCoordinate({}),
      buildCoordinate({ latitude: 51.0001, longitude: 7.0001 }),
      buildCoordinate({ latitude: 51.0001, longitude: 7.0003 }),
    ] as const;
    const summary = resolveAreaMeasurementSummary({
      annotation: buildAreaAnnotation(),
      toolType: ANNOTATION_TYPES.AREA_GROUND,
      coordinates,
    });
    const expectedPerimeterMeters =
      Cartesian3.distance(
        cartesian3FromGeographicCoordinate(coordinates[0]),
        cartesian3FromGeographicCoordinate(coordinates[1])
      ) +
      Cartesian3.distance(
        cartesian3FromGeographicCoordinate(coordinates[1]),
        cartesian3FromGeographicCoordinate(coordinates[2])
      ) +
      Cartesian3.distance(
        cartesian3FromGeographicCoordinate(coordinates[2]),
        cartesian3FromGeographicCoordinate(coordinates[0])
      );

    expect(summary.perimeterMeters).toBeCloseTo(expectedPerimeterMeters, 6);
    expect(summary.areaSquareMeters).toBeGreaterThan(0);
  });
});
