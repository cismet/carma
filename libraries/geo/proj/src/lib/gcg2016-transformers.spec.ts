import { describe, expect, it } from "vitest";

import type {
  Altitude,
  Coordinates,
  Latitude,
  Longitude,
} from "@carma-geo/data-structures";
import type { Meters } from "@carma-units";

import { UnsupportedVerticalOffsetRegionError } from "./tiled-vertical-offset";
import {
  dhhn2016ToEllipsoidalHeight,
  dhhn2016ToEllipsoidalHeights,
  ellipsoidalToDhhn2016Height,
  ellipsoidalToDhhn2016Heights,
  getGcg2016EcefTransformer,
  getGcg2016UndulationFromUtm,
  getGcg2016UtmVerticalTransformer,
  getGcg2016Wgs84VerticalTransformer,
  type Gcg2016UtmZone,
} from "./gcg2016-transformers";

const utmCoordinate = (
  east: number,
  north: number,
  zone: Gcg2016UtmZone
): Coordinates.ETRS89UTM => ({
  east: east as Coordinates.ETRS89UTMEastingMeters,
  north: north as Coordinates.ETRS89UTMNorthingMeters,
  zone,
});

describe("GCG2016 coordinate transformers", () => {
  const coordinatesByZone = {
    31: utmCoordinate(790_576.406151867, 5_684_877.044586919, 31),
    32: utmCoordinate(371_804.596993609, 5_678_240.294037223, 32),
    33: utmCoordinate(-46_659.940838972, 5_705_871.310704223, 33),
  } satisfies Record<Gcg2016UtmZone, Coordinates.ETRS89UTM>;
  const dhhn2016Height = 161.002 as Altitude.DHHN2016Meters;

  it("accepts every ETRS89 UTM zone covered by the GCG2016 source grid", async () => {
    const undulations = await Promise.all(
      Object.values(coordinatesByZone).map(getGcg2016UndulationFromUtm)
    );

    for (const undulation of undulations) {
      expect(undulation).toBeCloseTo(46.59667038816, 8);
    }
  });

  it("matches the BKG spline at the Mesh 2024 anchor", async () => {
    const coordinate = coordinatesByZone[32];
    await expect(getGcg2016UndulationFromUtm(coordinate)).resolves.toBeCloseTo(
      46.59667038816,
      8
    );
    await expect(
      dhhn2016ToEllipsoidalHeight(coordinate, dhhn2016Height)
    ).resolves.toBeCloseTo(207.59867038816, 8);
  });

  it("round-trips single and batched branded UTM heights", async () => {
    const coordinate = coordinatesByZone[32];
    const ellipsoidalHeight = await dhhn2016ToEllipsoidalHeight(
      coordinate,
      dhhn2016Height
    );
    await expect(
      ellipsoidalToDhhn2016Height(coordinate, ellipsoidalHeight)
    ).resolves.toBeCloseTo(dhhn2016Height, 12);

    const coordinates = [coordinate, coordinatesByZone[31]];
    const sourceHeights = [dhhn2016Height, 200 as Altitude.DHHN2016Meters];
    const ellipsoidal = await dhhn2016ToEllipsoidalHeights(
      coordinates,
      sourceHeights
    );
    const roundTrip = await ellipsoidalToDhhn2016Heights(
      coordinates,
      ellipsoidal
    );
    expect(roundTrip[0]).toBeCloseTo(dhhn2016Height, 10);
    expect(roundTrip[1]).toBeCloseTo(200, 10);
  });

  it("provides a cached zone-aware UTM vertical transformer", async () => {
    const transformer = getGcg2016UtmVerticalTransformer();
    const coordinate = coordinatesByZone[32];
    transformer.clearCache();
    await transformer.init(coordinate, 0);

    expect(transformer.cachedTileCount).toBe(1);
    expect(transformer.sourceReference).toMatchObject({
      horizontalCrs: ["EPSG:25831", "EPSG:25832", "EPSG:25833"],
      verticalCrs: "EPSG:7837",
    });
    const forward = await transformer.forward(coordinate, dhhn2016Height);
    const inverse = await transformer.inverse(coordinate, forward);

    expect(forward).toBeCloseTo(207.59867038816, 8);
    expect(inverse).toBeCloseTo(dhhn2016Height, 12);
  });

  it("supports WGS84 geographic coordinates with explicit epoch limitations", async () => {
    const transformer = getGcg2016Wgs84VerticalTransformer();
    const coordinate = [
      7.163461245 as Longitude.deg,
      51.241111235 as Latitude.deg,
    ];
    const forward = await transformer.forward(coordinate, dhhn2016Height);
    const inverse = await transformer.inverse(coordinate, forward);

    expect(transformer.sourceReference).toMatchObject({
      horizontalCrs: "EPSG:4326",
      epochTransformation: null,
    });
    expect(forward).toBeCloseTo(207.59867038816, 6);
    expect(inverse).toBeCloseTo(dhhn2016Height, 12);
  });

  it("round-trips UTM plus DHHN2016 through shared WGS84 ECEF utilities", async () => {
    const transformer = getGcg2016EcefTransformer();
    const coordinate = coordinatesByZone[32];
    const ecef = await transformer.forward(coordinate, dhhn2016Height);
    const inverse = await transformer.inverse(ecef, 32);

    expect(transformer.targetReference.crs).toBe("EPSG:4978");
    expect(Object.values(ecef).every(Number.isFinite)).toBe(true);
    expect(inverse.coordinate.east).toBeCloseTo(coordinate.east, 6);
    expect(inverse.coordinate.north).toBeCloseTo(coordinate.north, 6);
    expect(inverse.coordinate.zone).toBe(32);
    expect(inverse.height).toBeCloseTo(dhhn2016Height, 6);
  });

  it("fails explicitly for unsupported UTM zones and unloaded extents", async () => {
    const unsupportedZone = {
      east: 500_000 as Coordinates.ETRS89UTMEastingMeters,
      north: 5_700_000 as Coordinates.ETRS89UTMNorthingMeters,
      zone: 30,
    } satisfies Coordinates.ETRS89UTM;
    expect(() => getGcg2016UndulationFromUtm(unsupportedZone)).toThrow(
      RangeError
    );

    const outsideBundledExtent = utmCoordinate(
      391_776 as Meters,
      5_810_049,
      33
    );
    await expect(
      getGcg2016UndulationFromUtm(outsideBundledExtent)
    ).rejects.toBeInstanceOf(UnsupportedVerticalOffsetRegionError);
  });
});
