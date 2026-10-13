// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Degrees, Radians } from "@carma-units";
import { CardinalDirectionClockwise } from "@carma-geo/data-structures";
import type {
  ObliqueDataset,
  ObliqueImageRecord,
  ObliqueSelectionData,
} from "../types";
import {
  catalogImageExtent,
  catalogImageHeading,
  catalogImageMatches,
  EMPTY_CATALOG_IMAGE_FILTER,
  filterObliqueCatalog,
  type CatalogImageFilter,
} from "./catalog-image-filter";
const filter = (
  patch: Partial<CatalogImageFilter> = {}
): CatalogImageFilter => ({ ...EMPTY_CATALOG_IMAGE_FILTER, ...patch });
const image = (
  id: string,
  patch: Partial<ObliqueImageRecord> = {}
): ObliqueImageRecord =>
  ({
    id: `series:${id}`,
    sourceId: id,
    seriesId: "series",
    cameraId: "camera",
    lineIndex: 12,
    waypointIndex: 34,
    stationId: "station-a",
    sector: CardinalDirectionClockwise.North,
    pose: { bearingDeg: 355 },
    centerWGS84: [7, 51],
    ...patch,
  } as ObliqueImageRecord);
const dataset = {
  id: "series",
  label: "Spring flight",
  cameras: { camera: { view: "front" } },
} as unknown as ObliqueDataset;
const degree = (n: number) => n as Degrees;
describe("catalogue image filters", () => {
  it("combines global terms, ID and column filters with AND while alternatives use OR", () => {
    const record = image("RI_12_0034");
    expect(
      catalogImageMatches(
        record,
        dataset,
        filter({
          query: "spring station-a",
          id: " ri_12 ",
          cameras: ["other", "camera"],
          strips: ["12"],
          waypoints: ["34"],
          views: ["front"],
          series: ["series"],
        })
      )
    ).toBe(true);
    expect(
      catalogImageMatches(record, dataset, filter({ query: "spring missing" }))
    ).toBe(false);
    expect(
      catalogImageMatches(
        record,
        dataset,
        filter({ cameras: ["camera"], strips: ["99"] })
      )
    ).toBe(false);
  });
  it("normalizes headings and filters through north with inclusive endpoints", () => {
    const north = filter({ headingMin: degree(350), headingMax: degree(10) });
    for (const bearing of [350, -5, 0, 360, 10])
      expect(
        catalogImageMatches(
          image("north", {
            pose: { bearingDeg: bearing } as ObliqueImageRecord["pose"],
          }),
          dataset,
          north
        )
      ).toBe(true);
    for (const bearing of [349, 11, 180])
      expect(
        catalogImageMatches(
          image("outside", {
            pose: { bearingDeg: bearing } as ObliqueImageRecord["pose"],
          }),
          dataset,
          north
        )
      ).toBe(false);
    expect(
      catalogImageHeading(
        image("negative", {
          pose: { bearingDeg: -5 } as ObliqueImageRecord["pose"],
        })
      )
    ).toBeCloseTo(355);
  });
  it("uses fallback heading and makes unknown metadata explicitly filterable", () => {
    const unknown = image("unknown", {
      cameraId: "absent",
      lineIndex: undefined,
      waypointIndex: undefined,
      pose: undefined,
      fallbackHeading: Number.NaN as Radians,
    });
    expect(catalogImageMatches(unknown, dataset, filter())).toBe(true);
    expect(
      catalogImageMatches(
        unknown,
        dataset,
        filter({ strips: ["—"], waypoints: ["—"], views: ["—"] })
      )
    ).toBe(true);
    expect(
      catalogImageMatches(unknown, dataset, filter({ strips: ["12"] }))
    ).toBe(false);
    expect(
      catalogImageMatches(unknown, dataset, filter({ headingMin: degree(0) }))
    ).toBe(false);
    expect(
      catalogImageHeading(
        image("fallback", {
          pose: undefined,
          fallbackHeading: (Math.PI / 2) as Radians,
        })
      )
    ).toBeCloseTo(90);
  });
  it("preserves an unfiltered catalogue and returns exactly the eligible records and centers", () => {
    const a = image("A"),
      b = image("B", { cameraId: "other" });
    const data: ObliqueSelectionData = {
      imageRecords: new Map([
        [a.id, a],
        [b.id, b],
      ]),
      datasets: new Map([[dataset.id, dataset]]),
      centers: new Map([
        [a.id, { longitude: 7, latitude: 51 }],
        [b.id, { longitude: 8, latitude: 52 }],
      ]) as ObliqueSelectionData["centers"],
    };
    expect(filterObliqueCatalog(data, filter())).toBe(data);
    const eligible = filterObliqueCatalog(
      data,
      filter({ cameras: ["camera"] })
    )!;
    expect([...eligible.imageRecords.keys()]).toEqual([a.id]);
    expect([...eligible.centers.keys()]).toEqual([a.id]);
    expect(eligible.datasets).toBe(data.datasets);
    expect(data.imageRecords.size).toBe(2);
    expect(filterObliqueCatalog(null, filter())).toBeNull();
  });
  it("fits only requested calibrated footprints and ignores absent identifiers", async () => {
    const a = image("A", {
      footprint: [
        [7, 51],
        [7.01, 51],
        [7.01, 51.02],
        [7, 51.02],
        [7, 51],
      ],
    });
    const far = image("far", {
      footprint: [
        [100, 30],
        [101, 31],
      ],
    });
    const data: ObliqueSelectionData = {
      imageRecords: new Map([
        [a.id, a],
        [far.id, far],
      ]),
      datasets: new Map(),
      centers: new Map(),
    };
    expect(await catalogImageExtent(data, [a.id, "missing"])).toEqual([
      7, 51, 7.01, 51.02,
    ]);
    expect(await catalogImageExtent(data, ["missing"])).toBeNull();
  });
});
