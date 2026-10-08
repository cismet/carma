import { describe, expect, it } from "vitest";
import { degToRadNumeric, type Radians } from "@carma-units";
import type { ObliqueDataset, ObliquePitchSummary } from "../types";
import { getBrowsingPitchDeg } from "./browsing-pitch";
import { CardinalDirectionEnum as Direction } from "./orientation";

const total = (pitchDeg: number, imageCount: number): ObliquePitchSummary => ({
  pitchSumRad: (degToRadNumeric(pitchDeg) * imageCount) as Radians,
  imageCount,
});
const series = (id: string) => ({ id, pitchDeg: 45 } as ObliqueDataset);

describe("directional browsing pitch", () => {
  it("weights enabled image counts in the requested world sector and wraps bearings", () => {
    const data = {
      obliquePitchByDirectionBySeries: new Map([
        ["2024", new Map([[Direction.North, total(40, 3)], [Direction.East, total(38, 2)]])],
        ["2026", new Map([[Direction.North, total(44, 1)], [Direction.East, total(46, 2)]])],
        ["disabled", new Map([[Direction.North, total(80, 1000)]])],
      ]),
    };
    const enabled = [series("2024"), series("2026")];
    for (const bearing of [325, -35, 685])
      expect(getBrowsingPitchDeg(data, enabled, bearing, 45)).toBeCloseTo(41);
    expect(getBrowsingPitchDeg(data, enabled, 55, 45)).toBeCloseTo(42);
    expect(getBrowsingPitchDeg(data, [series("2026")], 325, 45)).toBeCloseTo(44);
  });

  it("uses manifest group calibration on startup by world heading rather than export label", () => {
    const configured = {
      ...series("2026"),
      directionalCatalogs: [
        { sector: "W", meanHeadingRad: degToRadNumeric(325), obliquePitch: total(43.2, 80) },
        { sector: "N", meanHeadingRad: degToRadNumeric(55), obliquePitch: total(44.1, 40) },
        { sector: "nadir", meanHeadingRad: degToRadNumeric(325), obliquePitch: total(1, 10000) },
      ],
    } as ObliqueDataset;
    expect(getBrowsingPitchDeg(null, [configured], 325, 45)).toBeCloseTo(43.2);
    expect(getBrowsingPitchDeg(null, [configured], 55, 45)).toBeCloseTo(44.1);
    const loaded = {
      obliquePitchByDirectionBySeries: new Map([
        [configured.id, new Map([[Direction.North, total(43.3, 5)]])],
      ]),
    };
    expect(getBrowsingPitchDeg(loaded, [configured], 325, 45)).toBeCloseTo(43.3);
  });

  it("retains measured legacy series means only when no directional evidence is available", () => {
    const data = { obliquePitchBySeries: new Map([
      ["2024", total(41.9, 2)], ["disabled", total(80, 1000)],
    ]) };
    expect(getBrowsingPitchDeg(data, [series("2024")], 235, 45)).toBeCloseTo(41.9);
    expect(getBrowsingPitchDeg(data, [], 235, 45)).toBe(45);
  });

  it("does not admit invalid or empty calibration totals", () => {
    const data = { obliquePitchByDirectionBySeries: new Map([
      ["2026", new Map([[Direction.North, { pitchSumRad: NaN as Radians, imageCount: 2 }]])],
    ]) };
    expect(getBrowsingPitchDeg(data, [series("2026")], 325, 42)).toBe(42);
  });
});
