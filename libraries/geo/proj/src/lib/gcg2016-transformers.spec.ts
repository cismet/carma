import { describe, expect, it } from "vitest";

import {
  dhhn2016ToEllipsoidalHeight,
  dhhn2016ToEllipsoidalHeights,
  ellipsoidalToDhhn2016Height,
  ellipsoidalToDhhn2016Heights,
  getGcg2016EcefTransformer,
  getGcg2016UndulationFromUtm32,
  getGcg2016Utm32VerticalTransformer,
  getGcg2016Wgs84VerticalTransformer,
} from "./gcg2016-transformers";

describe("GCG2016 coordinate transformers", () => {
  const easting = 371_804.597;
  const northing = 5_678_240.294;
  const dhhn2016Height = 161.002;

  it("matches the BKG spline at the Mesh 2024 anchor", async () => {
    await expect(
      getGcg2016UndulationFromUtm32(easting, northing)
    ).resolves.toBeCloseTo(46.59667038816, 8);
    await expect(
      dhhn2016ToEllipsoidalHeight(easting, northing, dhhn2016Height)
    ).resolves.toBeCloseTo(207.59867038816, 8);
  });

  it("round-trips single and batched UTM32 heights", async () => {
    const ellipsoidalHeight = await dhhn2016ToEllipsoidalHeight(
      easting,
      northing,
      dhhn2016Height
    );
    await expect(
      ellipsoidalToDhhn2016Height(easting, northing, ellipsoidalHeight)
    ).resolves.toBeCloseTo(dhhn2016Height, 12);

    const source = [
      { easting, northing, height: dhhn2016Height },
      { easting: easting + 10, northing: northing + 10, height: 200 },
    ];
    const ellipsoidal = await dhhn2016ToEllipsoidalHeights(source);
    const roundTrip = await ellipsoidalToDhhn2016Heights(
      source.map((coordinate, index) => ({
        ...coordinate,
        height: ellipsoidal[index],
      }))
    );
    expect(roundTrip[0]).toBeCloseTo(dhhn2016Height, 10);
    expect(roundTrip[1]).toBeCloseTo(200, 10);
  });

  it("provides a cached proj4-like UTM32 forward/inverse transformer", async () => {
    const transformer = getGcg2016Utm32VerticalTransformer();
    transformer.clearCache();
    await transformer.init([easting, northing], 0);

    expect(transformer.cachedTileCount).toBe(1);
    expect(transformer.sourceReference).toMatchObject({
      horizontalCrs: "EPSG:25832",
      verticalCrs: "EPSG:7837",
    });
    const forward = await transformer.forward([
      easting,
      northing,
      dhhn2016Height,
    ]);
    const inverse = await transformer.inverse(forward);

    expect(forward[0]).toBe(easting);
    expect(forward[1]).toBe(northing);
    expect(forward[2]).toBeCloseTo(207.59867038816, 8);
    expect(inverse[2]).toBeCloseTo(dhhn2016Height, 12);
  });

  it("supports WGS84 geographic coordinates with explicit epoch limitations", async () => {
    const transformer = getGcg2016Wgs84VerticalTransformer();
    const source = [7.163461245, 51.241111235, dhhn2016Height] as const;
    const forward = await transformer.forward(source);
    const inverse = await transformer.inverse(forward);

    expect(transformer.sourceReference).toMatchObject({
      horizontalCrs: "EPSG:4326",
      epochTransformation: null,
    });
    expect(forward[0]).toBe(source[0]);
    expect(forward[1]).toBe(source[1]);
    expect(forward[2]).toBeCloseTo(207.59867038816, 6);
    expect(inverse[2]).toBeCloseTo(dhhn2016Height, 12);
  });

  it("round-trips UTM32 plus DHHN2016 through shared WGS84 ECEF utilities", async () => {
    const transformer = getGcg2016EcefTransformer();
    const source = [easting, northing, dhhn2016Height] as const;
    const ecef = await transformer.forward(source);
    const inverse = await transformer.inverse(ecef);

    expect(transformer.targetReference.crs).toBe("EPSG:4978");
    expect(ecef.every(Number.isFinite)).toBe(true);
    expect(inverse[0]).toBeCloseTo(easting, 6);
    expect(inverse[1]).toBeCloseTo(northing, 6);
    expect(inverse[2]).toBeCloseTo(dhhn2016Height, 6);
  });
});
