import { describe, expect, it } from "vitest";
import { degToRadNumeric, type Radians } from "@carma-units";
import type { ObliqueDirectionalCatalog } from "../types";
import { CardinalDirectionEnum, getCardinalHeadings } from "./orientation";
import {
  getSeriesCardinalHeadings,
  nextSeriesCardinalHeading,
} from "./series-cardinal-headings";

const rad = (degrees: number) => degToRadNumeric(degrees) as Radians;
const group = (
  sector: ObliqueDirectionalCatalog["sector"],
  heading: number,
  imageCount = 1
): ObliqueDirectionalCatalog => ({
  id: "unrelated-source-label",
  sector,
  meanHeadingRad: rad(heading),
  imageCount,
  cameraIds: [],
  exteriorOrientationsURI: "/unused",
});
const headings = (
  directionalCatalogs: ObliqueDirectionalCatalog[] = [],
  headingOffsetDeg = -35
) => getSeriesCardinalHeadings({ directionalCatalogs, headingOffsetDeg });

describe("series optical cardinal headings", () => {
  it("uses declared sectors and optical means rather than labels or nearest true-north quadrant", () => {
    const value = headings([
      group("N", 305),
      group("E", 35),
      group("S", 135),
      group("W", 225),
      group("nadir", 0, 999),
    ]);
    expect(value).toEqual([rad(305), rad(35), rad(135), rad(225)]);
    expect(value[CardinalDirectionEnum.North]).not.toBe(0);
  });

  it("combines wraparound groups by positive image counts using circular means", () => {
    const groups = [group("N", 350, 3), group("N", 10, 1)];
    const expected =
      Math.atan2(
        3 * Math.sin(rad(350)) + Math.sin(rad(10)),
        3 * Math.cos(rad(350)) + Math.cos(rad(10))
      ) +
      Math.PI * 2;
    expect(headings(groups)[0]).toBeCloseTo(expected);
    expect(headings([...groups].reverse())).toEqual(headings(groups));
    const equal = headings([group("N", 350), group("N", 10)])[0];
    expect(Math.min(equal, Math.PI * 2 - equal)).toBeLessThan(1e-12);
  });

  it("retains independent offset fallbacks for missing or invalid groups and ignores nadir", () => {
    const value = headings([
      group("N", 320, 2),
      group("E", 70, 0),
      group("E", 80, -2),
      group("E", NaN),
      group("S", 160, Infinity),
      group("W", 240, NaN),
      group("nadir", 0, 1e9),
    ]);
    const expected = getCardinalHeadings(rad(-35));
    expect(value[0]).toBeCloseTo(rad(320));
    expect(value.slice(1)).toEqual(expected.slice(1));
    expect(getSeriesCardinalHeadings({ headingOffsetDeg: 10 })).toEqual(
      getCardinalHeadings(rad(10))
    );
  });

  it("uses fallback for undefined antipodal means and avoids overflowing finite weights", () => {
    expect(headings([group("N", 0), group("N", 180)])[0]).toBe(rad(325));
    const large = headings([group("N", 350, 1e308), group("N", 10, 1e308)])[0];
    expect(Number.isFinite(large)).toBe(true);
    expect(Math.min(large, Math.PI * 2 - large)).toBeLessThan(1e-12);
  });

  it("rotates camera bearings clockwise toward East and counterclockwise toward West", () => {
    const values = headings([
      group("N", 350),
      group("E", 80),
      group("S", 170),
      group("W", 260),
    ]);
    expect(nextSeriesCardinalHeading(rad(10), values, true)).toBeCloseTo(
      rad(80)
    );
    expect(nextSeriesCardinalHeading(rad(10), values, false)).toBeCloseTo(
      rad(350)
    );
    expect(nextSeriesCardinalHeading(rad(260), values, true)).toBeCloseTo(
      rad(350)
    );
    expect(nextSeriesCardinalHeading(rad(260), values, false)).toBeCloseTo(
      rad(170)
    );
  });

  it("normalizes wrap and deterministically handles duplicate alignments", () => {
    const values = [rad(0), rad(90), rad(180), rad(270)];
    expect(nextSeriesCardinalHeading(rad(45), values, true)).toBe(rad(90));
    expect(nextSeriesCardinalHeading(rad(405), values, false)).toBe(rad(0));
    expect(
      nextSeriesCardinalHeading(
        rad(-10),
        [rad(-10), rad(80), rad(170), rad(260)],
        false
      )
    ).toBe(rad(260));
  });
  it("takes the next directed alignment from off-axis bearings without skipping the nearest forward target", () => {
    const values = [325, 55, 145, 235].map(rad);
    expect(nextSeriesCardinalHeading(rad(120), values, true)).toBe(rad(145));
    expect(nextSeriesCardinalHeading(rad(120), values, false)).toBe(rad(55));
    expect(nextSeriesCardinalHeading(rad(330), values, true)).toBe(rad(55));
    expect(nextSeriesCardinalHeading(rad(330), values, false)).toBe(rad(325));
    expect(nextSeriesCardinalHeading(rad(325), values, true)).toBe(rad(55));
    expect(nextSeriesCardinalHeading(rad(325), values, false)).toBe(rad(235));
    expect(
      nextSeriesCardinalHeading(
        rad(120),
        [rad(145), rad(145), rad(235), rad(55)],
        true
      )
    ).toBe(rad(145));
  });

  it("skips alignments within tolerance on either side while retaining real small rotations", () => {
    const values = [325, 55, 145, 235].map(rad);
    for (const delta of [-0.5e-6, 0, 0.5e-6]) {
      expect(
        nextSeriesCardinalHeading((rad(55) + delta) as Radians, values, true)
      ).toBe(rad(145));
      expect(
        nextSeriesCardinalHeading((rad(55) + delta) as Radians, values, false)
      ).toBe(rad(325));
    }
    expect(
      nextSeriesCardinalHeading((rad(55) - 2e-6) as Radians, values, true)
    ).toBe(rad(55));
    expect(
      nextSeriesCardinalHeading((rad(55) + 2e-6) as Radians, values, false)
    ).toBe(rad(55));
  });
});
