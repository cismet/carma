import { describe, expect, it } from "vitest";

import {
  getGcg2016Undulation,
  queryGcg2016Undulation,
  queryGcg2016Undulations,
} from "./gcg2016";

describe("GCG2016 tiled grid", () => {
  it("matches the full source grid across a dynamic two-degree tile seam", async () => {
    const [west, east] = await Promise.all([
      getGcg2016Undulation(7.9999, 51.25),
      getGcg2016Undulation(8.0001, 51.25),
    ]);

    expect(west).toBeCloseTo(47.540711542030451, 10);
    expect(east).toBeCloseTo(47.540946365773216, 10);
  });

  it("returns an auditable query result without presenting physical accuracy as known", async () => {
    const result = await queryGcg2016Undulation(7.25, 51.25);

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
        tiledResourceAgreement: {
          pointCount: 383384,
          maximumDistanceMeters: 0,
        },
        physicalModelAccuracyMeters: null,
      },
    });
    expect(result.undulationMeters).toBeCloseTo(46.718027052093014, 10);
  });

  it("preserves order in batched queries", async () => {
    const queries = await queryGcg2016Undulations([
      { longitude: 7.25, latitude: 51.25 },
      { longitude: 8.25, latitude: 51.25 },
    ]);
    expect(queries.map(({ resourceTileIds }) => resourceTileIds)).toEqual([
      ["N50E006"],
      ["N50E008"],
    ]);
  });
});
