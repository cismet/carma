import { describe, expect, it } from "vitest";

import {
  metersPerPixelAt,
  readPointCloudElevationConfig,
} from "./pointcloud-elevation-config";

const symbolLayer = (block: unknown) => ({
  id: "arrows",
  type: "symbol",
  metadata: { carmaConf: { pointcloudElevation: block } },
});

describe("readPointCloudElevationConfig", () => {
  it("reads a full block", () => {
    expect(
      readPointCloudElevationConfig(
        symbolLayer({
          property: "altitude",
          offset: -2,
          verticalDatum: "dhhn2016",
          occlude: true,
        })
      )
    ).toEqual({
      property: "altitude",
      offset: -2,
      verticalDatum: "dhhn2016",
      occlude: true,
    });
  });

  it("defaults offset, datum and occlusion", () => {
    expect(
      readPointCloudElevationConfig(symbolLayer({ property: "z" }))
    ).toEqual({
      property: "z",
      offset: 0,
      verticalDatum: "ellipsoidal",
      occlude: false,
    });
  });

  it("ignores blocks without a property and non-symbol layers", () => {
    expect(readPointCloudElevationConfig(symbolLayer({}))).toBeNull();
    expect(readPointCloudElevationConfig(symbolLayer("altitude"))).toBeNull();
    expect(
      readPointCloudElevationConfig({
        ...symbolLayer({ property: "altitude" }),
        type: "circle",
      })
    ).toBeNull();
    expect(readPointCloudElevationConfig({ type: "symbol" })).toBeNull();
  });
});

describe("metersPerPixelAt", () => {
  it("halves with every zoom level", () => {
    const z16 = metersPerPixelAt(16, 51.25);
    expect(metersPerPixelAt(17, 51.25)).toBeCloseTo(z16 / 2, 10);
  });

  it("is about 2.39 m at the equator on zoom 15", () => {
    expect(metersPerPixelAt(15, 0)).toBeCloseTo(2.389, 2);
  });
});
