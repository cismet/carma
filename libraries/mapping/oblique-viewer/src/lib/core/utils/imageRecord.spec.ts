// @vitest-environment node
import { describe, expect, it } from "vitest";
import { degToRad, type Degrees } from "@carma-units";
import type { ObliqueDataset, ObliqueImageRecord } from "../types";
import { CardinalDirectionEnum } from "./orientation";
import {
  getMeanPhotoReference,
  summarizeObliquePitchStatistics,
} from "./imageRecord";
import { summarizeDirectionalCatalogPitch } from "./browsing-pitch";

const radians = (angle: number) => degToRad(angle as Degrees);
const dataset = {
  id: "series",
  cameras: { oblique: { view: "front" }, nadir: { view: "nadir" } },
} as unknown as ObliqueDataset;
const record = (
  id: string,
  pitchDeg: number,
  bearingDeg: number,
  cameraId = "oblique"
): ObliqueImageRecord =>
  ({
    id,
    seriesId: dataset.id,
    cameraId,
    // This nominal export sector is deliberately unrelated to optical bearing.
    sector: CardinalDirectionEnum.West,
    pose: { pitchDeg, bearingDeg },
  } as ObliqueImageRecord);

describe("calibrated browsing pitch summaries", () => {
  it("uses true world bearing sectors, wraps north and excludes nadir/invalid pitches", () => {
    const records = [
      record("north", 40, 325),
      record("wrapped-north", 44, -35),
      record("east", 42, 54),
      record("south", 46, 145),
      record("west", 48, 235),
      record("nadir", 20, 325, "nadir"),
      record("zero", 0, 325),
      record("right-angle", 90, 325),
      record("invalid", Number.NaN, 325),
    ];
    const totals = summarizeObliquePitchStatistics({
      datasets: new Map([[dataset.id, dataset]]),
      imageRecords: new Map(records.map((image) => [image.id, image])),
    });
    const directions = totals.obliquePitchByDirectionBySeries.get(dataset.id)!;
    expect(directions.get(CardinalDirectionEnum.North)).toEqual({
      pitchSumRad: radians(40) + radians(44),
      imageCount: 2,
    });
    for (const [direction, pitch] of [
      [CardinalDirectionEnum.East, 42],
      [CardinalDirectionEnum.South, 46],
      [CardinalDirectionEnum.West, 48],
    ] as const)
      expect(directions.get(direction)).toEqual({
        pitchSumRad: radians(pitch),
        imageCount: 1,
      });
    expect(totals.obliquePitchBySeries.get(dataset.id)?.imageCount).toBe(5);
  });

  it("retains a valid series pitch without inventing a directional bearing", () => {
    const image = record("missing-bearing", 42, Number.NaN);
    const totals = summarizeObliquePitchStatistics({
      datasets: new Map([[dataset.id, dataset]]),
      imageRecords: new Map([[image.id, image]]),
    });
    expect(totals.obliquePitchBySeries.get(dataset.id)?.imageCount).toBe(1);
    expect(totals.obliquePitchByDirectionBySeries.size).toBe(0);
  });

  it("combines disjoint full groups by measured bearing and excludes nadir summaries", () => {
    const groups: ObliqueDataset = {
      ...dataset,
      directionalCatalogs: [
        {
          id: "N",
          sector: "N",
          meanHeadingRad: radians(325),
          imageCount: 2,
          obliquePitch: { pitchSumRad: radians(80), imageCount: 2 },
        },
        {
          id: "E",
          sector: "E",
          meanHeadingRad: radians(-35),
          imageCount: 1,
          obliquePitch: { pitchSumRad: radians(44), imageCount: 1 },
        },
        {
          id: "S",
          sector: "S",
          meanHeadingRad: radians(54),
          imageCount: 1,
          obliquePitch: { pitchSumRad: radians(46), imageCount: 1 },
        },
        {
          id: "nadir",
          sector: "nadir",
          meanHeadingRad: radians(325),
          imageCount: 99,
          obliquePitch: { pitchSumRad: radians(20), imageCount: 99 },
        },
      ].map((group) => ({
        ...group,
        cameraIds: [],
        exteriorOrientationsURI: "/",
      })) as ObliqueDataset["directionalCatalogs"],
    };
    const totals = summarizeDirectionalCatalogPitch(groups);
    expect(totals.total?.imageCount).toBe(4);
    expect(totals.byDirection.get(CardinalDirectionEnum.North)).toEqual({
      pitchSumRad: radians(80) + radians(44),
      imageCount: 3,
    });
    expect(totals.byDirection.get(CardinalDirectionEnum.East)?.imageCount).toBe(
      1
    );
  });

  it("does not replace a partial sector if any group in that sector lacks a valid summary", () => {
    const groups: ObliqueDataset = {
      ...dataset,
      directionalCatalogs: [
        {
          id: "a",
          sector: "N",
          meanHeadingRad: radians(325),
          imageCount: 1,
          obliquePitch: { pitchSumRad: radians(42), imageCount: 1 },
        },
        { id: "b", sector: "E", meanHeadingRad: radians(-35), imageCount: 1 },
        {
          id: "c",
          sector: "S",
          meanHeadingRad: radians(54),
          imageCount: 1,
          obliquePitch: { pitchSumRad: radians(46), imageCount: 1 },
        },
      ].map((group) => ({
        ...group,
        cameraIds: [],
        exteriorOrientationsURI: "/",
      })) as ObliqueDataset["directionalCatalogs"],
    };
    const totals = summarizeDirectionalCatalogPitch(groups);
    expect(totals.total).toBeUndefined();
    expect(totals.byDirection.has(CardinalDirectionEnum.North)).toBe(false);
    expect(totals.byDirection.get(CardinalDirectionEnum.East)?.imageCount).toBe(
      1
    );
  });
});

describe("per-series cardinal reference means", () => {
  it("uses circular calibrated heading and optical pitch in each record sector", () => {
    const first = {
      ...record("first", 40, 359),
      sector: CardinalDirectionEnum.North,
    };
    const second = {
      ...record("second", 44, 1),
      sector: CardinalDirectionEnum.North,
    };
    const east = {
      ...record("east", 48, 55),
      sector: CardinalDirectionEnum.East,
    };
    const data = summarizeObliquePitchStatistics({
      datasets: new Map([[dataset.id, dataset]]),
      imageRecords: new Map(
        [first, second, east].map((image) => [image.id, image])
      ),
    });
    const north = getMeanPhotoReference(data, first)!;
    expect(north.pitchDeg).toBeCloseTo(42, 10);
    expect(Math.min(north.headingDeg, 360 - north.headingDeg)).toBeLessThan(
      1e-10
    );
    expect(getMeanPhotoReference(data, east)).toEqual({
      pitchDeg: expect.closeTo(48, 10),
      headingDeg: expect.closeTo(55, 10),
    });
    expect(getMeanPhotoReference(data, first, 60 as Degrees)).toEqual({
      ...north,
      pitchDeg: 60,
    });
  });

  it("keeps series separate and never scans records or falls back to another series", () => {
    const first = {
      ...record("first", 42, 325),
      sector: CardinalDirectionEnum.North,
    };
    const other = {
      ...record("other", 45, 326),
      seriesId: "other",
      sector: CardinalDirectionEnum.North,
    };
    const data = summarizeObliquePitchStatistics({
      datasets: new Map([
        [dataset.id, dataset],
        ["other", { ...dataset, id: "other" }],
      ]),
      imageRecords: new Map([first, other].map((image) => [image.id, image])),
    });
    expect(getMeanPhotoReference(data, first)!.pitchDeg).toBeCloseTo(42, 10);
    expect(getMeanPhotoReference(data, other)!.pitchDeg).toBeCloseTo(45, 10);
    expect(
      getMeanPhotoReference(data, { ...first, seriesId: "missing" })
    ).toBeNull();
    expect(
      getMeanPhotoReference(data, {
        ...first,
        sector: CardinalDirectionEnum.South,
      })
    ).toBeNull();
    expect(getMeanPhotoReference(data, first, NaN as Degrees)).toBeNull();
  });

  it("reuses derived means and invalidates a changed summary without rereading records", () => {
    const image = record("image", 42, 325);
    const data = summarizeObliquePitchStatistics({
      datasets: new Map([[dataset.id, dataset]]),
      imageRecords: new Map([[image.id, image]]),
    });
    const first = getMeanPhotoReference(data, image)!;
    expect(getMeanPhotoReference(data, image)).toBe(first);
    const summary = data.obliqueReferenceByDirectionBySeries
      .get(dataset.id)!
      .get(image.sector)!;
    summary.opticalPitchSumRad = radians(44);
    const updated = getMeanPhotoReference(data, image)!;
    expect(updated).not.toBe(first);
    expect(updated.pitchDeg).toBeCloseTo(44, 10);
    expect(first.pitchDeg).toBeCloseTo(42, 10);
  });

  it("excludes nadir, invalid poses and undefined circular means", () => {
    const valid = record("valid", 42, 325);
    const nadir = record("nadir", 2, 325, "nadir");
    const invalid = record("invalid", 42, NaN);
    const data = summarizeObliquePitchStatistics({
      datasets: new Map([[dataset.id, dataset]]),
      imageRecords: new Map(
        [valid, nadir, invalid].map((image) => [image.id, image])
      ),
    });
    expect(
      data.obliqueReferenceByDirectionBySeries
        .get(dataset.id)!
        .get(valid.sector)!.imageCount
    ).toBe(1);
    const summary = data.obliqueReferenceByDirectionBySeries
      .get(dataset.id)!
      .get(valid.sector)!;
    summary.headingSinSum = 0;
    summary.headingCosSum = 0;
    expect(getMeanPhotoReference(data, valid)).toBeNull();
  });
});
