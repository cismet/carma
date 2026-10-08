// @vitest-environment node
import { describe, expect, it } from "vitest";
import { degToRad, type Degrees } from "@carma-units";
import type { ObliqueDataset, ObliqueImageRecord } from "../types";
import { CardinalDirectionEnum } from "./orientation";
import { summarizeObliquePitchStatistics } from "./imageRecord";
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
        { id: "N", sector: "N", meanHeadingRad: radians(325), imageCount: 2,
          obliquePitch: { pitchSumRad: radians(80), imageCount: 2 } },
        { id: "E", sector: "E", meanHeadingRad: radians(-35), imageCount: 1,
          obliquePitch: { pitchSumRad: radians(44), imageCount: 1 } },
        { id: "S", sector: "S", meanHeadingRad: radians(54), imageCount: 1,
          obliquePitch: { pitchSumRad: radians(46), imageCount: 1 } },
        { id: "nadir", sector: "nadir", meanHeadingRad: radians(325), imageCount: 99,
          obliquePitch: { pitchSumRad: radians(20), imageCount: 99 } },
      ].map((group) => ({ ...group, cameraIds: [], exteriorOrientationsURI: "/" })) as ObliqueDataset["directionalCatalogs"],
    };
    const totals = summarizeDirectionalCatalogPitch(groups);
    expect(totals.total?.imageCount).toBe(4);
    expect(totals.byDirection.get(CardinalDirectionEnum.North)).toEqual({
      pitchSumRad: radians(80) + radians(44), imageCount: 3,
    });
    expect(totals.byDirection.get(CardinalDirectionEnum.East)?.imageCount).toBe(1);
  });

  it("does not replace a partial sector if any group in that sector lacks a valid summary", () => {
    const groups: ObliqueDataset = {
      ...dataset,
      directionalCatalogs: [
        { id: "a", sector: "N", meanHeadingRad: radians(325), imageCount: 1,
          obliquePitch: { pitchSumRad: radians(42), imageCount: 1 } },
        { id: "b", sector: "E", meanHeadingRad: radians(-35), imageCount: 1 },
        { id: "c", sector: "S", meanHeadingRad: radians(54), imageCount: 1,
          obliquePitch: { pitchSumRad: radians(46), imageCount: 1 } },
      ].map((group) => ({ ...group, cameraIds: [], exteriorOrientationsURI: "/" })) as ObliqueDataset["directionalCatalogs"],
    };
    const totals = summarizeDirectionalCatalogPitch(groups);
    expect(totals.total).toBeUndefined();
    expect(totals.byDirection.has(CardinalDirectionEnum.North)).toBe(false);
    expect(totals.byDirection.get(CardinalDirectionEnum.East)?.imageCount).toBe(1);
  });
});
