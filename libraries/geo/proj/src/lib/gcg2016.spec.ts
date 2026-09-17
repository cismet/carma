import { describe, expect, it } from "vitest";

import type { Latitude, Longitude } from "@carma-geo/data-structures";

import {
  getGcg2016Undulation,
  queryGcg2016Undulation,
  queryGcg2016Undulations,
} from "./gcg2016";
import { UnsupportedVerticalOffsetRegionError } from "./tiled-vertical-offset";

describe("GCG2016 tiled grid", () => {
  // The bundled set holds the single two-degree tile the elevation coverage
  // reaches into, so the stencil that once crossed a tile seam now runs off the
  // edge of the bundle instead. Seam crossing itself stays covered by
  // tiled-vertical-offset.spec.ts, which builds a multi-tile set directly.
  it("resolves inside the bundled tile and refuses coordinates beyond it", async () => {
    await expect(
      getGcg2016Undulation(7.9 as Longitude.deg, 51.25 as Latitude.deg)
    ).resolves.toBeCloseTo(47.420052107263714, 3);

    await expect(
      getGcg2016Undulation(8.0001 as Longitude.deg, 51.25 as Latitude.deg)
    ).rejects.toBeInstanceOf(UnsupportedVerticalOffsetRegionError);
  });

  it("returns an auditable query result without presenting physical accuracy as known", async () => {
    const result = await queryGcg2016Undulation(
      7.25 as Longitude.deg,
      51.25 as Latitude.deg
    );

    expect(result).toMatchObject({
      coordinate: {
        longitude: 7.25,
        latitude: 51.25,
        horizontalCrs: "EPSG:10283 (ETRS89/DREF91/2016)",
      },
      resourceTileIds: ["N50E006"],
      method: {
        id: "bkg-natural-bicubic-spline-5x5",
        stencil: { longitudeSamples: 5, latitudeSamples: 5 },
      },
      validation: {
        officialReferenceAgreement: {
          pointCount: 321201,
          maximumDistanceMeters: 0.000501833693043352,
        },
        physicalModelAccuracyMeters: null,
      },
    });
    expect(result.undulationMeters).toBeCloseTo(46.718027052093014, 3);
    // Generated figures are asserted as bounds, not as literals, so a
    // regenerated payload does not churn the test.
    expect(
      result.validation.tiledResourceAgreement.maximumDistanceMeters
    ).toBeLessThanOrEqual(result.validation.sampleEncoding.quantumMeters);
    expect(result.softwareBoundMeters).toBeGreaterThan(0);
  });

  it("preserves order in batched queries", async () => {
    const queries = await queryGcg2016Undulations([
      [7.25 as Longitude.deg, 51.25 as Latitude.deg],
      [6.75 as Longitude.deg, 51.5 as Latitude.deg],
    ]);
    expect(queries.map(({ coordinate }) => coordinate.longitude)).toEqual([
      7.25, 6.75,
    ]);
    expect(queries.map(({ resourceTileIds }) => resourceTileIds)).toEqual([
      ["N50E006"],
      ["N50E006"],
    ]);
  });
});
