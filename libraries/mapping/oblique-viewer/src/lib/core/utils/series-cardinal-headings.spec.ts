import { describe, expect, it } from "vitest";
import { degToRadNumeric, type Radians } from "@carma-units";
import type {
  CardinalDirection,
  ObliqueDirectionalCatalog,
  ObliqueReferenceSummary,
  ObliqueSelectionData,
} from "../types";
import {
  CardinalDirectionEnum,
  getCardinalHeadings,
  findClosestCardinalIndex,
} from "./orientation";
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

const references = (
  values: number[],
  imageCount = 1
): Map<CardinalDirection, ObliqueReferenceSummary> =>
  new Map(
    values.map((heading, sector) => [
      sector as CardinalDirection,
      {
        opticalPitchSumRad: rad(45 * imageCount),
        headingSinSum: Math.sin(rad(heading)) * imageCount,
        headingCosSum: Math.cos(rad(heading)) * imageCount,
        imageCount,
      },
    ])
  );

const referenceData = (
  ...entries: [string, Map<CardinalDirection, ObliqueReferenceSummary>][]
): Pick<ObliqueSelectionData, "obliqueReferenceByDirectionBySeries"> => ({
  obliqueReferenceByDirectionBySeries: new Map(entries),
});

describe("series optical cardinal headings", () => {
  it("rotates compact catalogues from their actual west mean to their own north mean without directional slices", () => {
    const values = getSeriesCardinalHeadings(
      { id: "2026", headingOffsetDeg: 0 },
      referenceData(["2026", references([325, 55, 145, 235])])
    );
    [325, 55, 145, 235].forEach((heading, sector) =>
      expect(values[sector]).toBeCloseTo(rad(heading), 12)
    );
    expect(nextSeriesCardinalHeading(rad(235), values, true)).toBeCloseTo(
      rad(325),
      12
    );
    expect(nextSeriesCardinalHeading(rad(235), values, true)).not.toBe(
      rad(270)
    );
  });

  it.each([234.51, 234.9])(
    "advances the nearest measured mosaic bank from capture bearing %s instead of taking a tiny step into that same bank",
    (captureHeading) => {
      const values = getSeriesCardinalHeadings(
        { id: "2026", headingOffsetDeg: 0 },
        referenceData(["2026", references([325, 55, 145, 235])])
      );
      const bank =
        values[findClosestCardinalIndex(rad(captureHeading), values)];
      expect(bank).toBeCloseTo(rad(235), 12);
      expect(nextSeriesCardinalHeading(bank, values, true)).toBeCloseTo(
        rad(325),
        12
      );
      expect(nextSeriesCardinalHeading(bank, values, false)).toBeCloseTo(
        rad(145),
        12
      );
      // Free navigation still advances from the actual off-axis bearing.
      expect(
        nextSeriesCardinalHeading(rad(captureHeading), values, true)
      ).toBeCloseTo(rad(235), 12);
    }
  );

  it("prefers current worker means over stale slice means and configured offsets without mutating the catalogue", () => {
    const directionalCatalogs = [
      group("N", 0),
      group("E", 90),
      group("S", 180),
      group("W", 270),
    ];
    const catalogue = { id: "2026", headingOffsetDeg: 15, directionalCatalogs };
    const current = references([325, 55, 145, 235], 40);
    const before = [...current.entries()].map(([sector, value]) => [
      sector,
      { ...value },
    ]);
    directionalCatalogs.forEach(Object.freeze);
    Object.freeze(directionalCatalogs);
    Object.freeze(catalogue);
    current.forEach(Object.freeze);
    const values = getSeriesCardinalHeadings(
      catalogue,
      referenceData(["2026", current])
    );
    [325, 55, 145, 235].forEach((heading, sector) =>
      expect(values[sector]).toBeCloseTo(rad(heading), 12)
    );
    expect(directionalCatalogs.map((slice) => slice.meanHeadingRad)).toEqual(
      [0, 90, 180, 270].map(rad)
    );
    expect(catalogue.headingOffsetDeg).toBe(15);
    expect([...current.entries()]).toEqual(before);
  });

  it("never pools other series even when they have many more observations", () => {
    const data = referenceData(
      ["2026", references([325, 55, 145, 235], 2)],
      ["2024", references([310, 40, 130, 220], 10000)]
    );
    for (const [id, expected] of [
      ["2026", [325, 55, 145, 235]],
      ["2024", [310, 40, 130, 220]],
    ] as const) {
      const actual = getSeriesCardinalHeadings(
        { id, headingOffsetDeg: 0 },
        data
      );
      expected.forEach((heading, sector) =>
        expect(actual[sector]).toBeCloseTo(rad(heading), 12)
      );
    }
    expect(
      getSeriesCardinalHeadings({ id: "missing", headingOffsetDeg: 10 }, data)
    ).toEqual(getCardinalHeadings(rad(10)));
    expect(getSeriesCardinalHeadings({ headingOffsetDeg: 10 }, data)).toEqual(
      getCardinalHeadings(rad(10))
    );
  });

  it.each([
    { imageCount: 0 },
    { imageCount: Infinity },
    { opticalPitchSumRad: rad(NaN) },
    { headingSinSum: NaN },
    { headingCosSum: Infinity },
    { headingSinSum: 0, headingCosSum: 0 },
  ])(
    "retains sector-local slice and configured fallbacks for invalid reference %j",
    (invalid) => {
      const current = references([325, 55, 145]);
      Object.assign(current.get(CardinalDirectionEnum.East)!, invalid);
      const actual = getSeriesCardinalHeadings(
        {
          id: "2026",
          headingOffsetDeg: 10,
          directionalCatalogs: [group("E", 75)],
        },
        referenceData(["2026", current])
      );
      expect(actual[CardinalDirectionEnum.North]).toBeCloseTo(rad(325), 12);
      expect(actual[CardinalDirectionEnum.East]).toBeCloseTo(rad(75), 12);
      expect(actual[CardinalDirectionEnum.South]).toBeCloseTo(rad(145), 12);
      expect(actual[CardinalDirectionEnum.West]).toBeCloseTo(rad(280), 12);
    }
  );

  it.each([null, undefined, {}])(
    "keeps existing header-only headings when selection data is %j",
    (data) => {
      const catalogue = {
        id: "2026",
        headingOffsetDeg: -35,
        directionalCatalogs: [group("N", 320)],
      };
      expect(getSeriesCardinalHeadings(catalogue, data)).toEqual(
        getSeriesCardinalHeadings(catalogue)
      );
    }
  );

  it("selects each series' own measured heading group instead of rounding the observer to a world quadrant", () => {
    expect(findClosestCardinalIndex(rad(300), headings())).toBe(
      CardinalDirectionEnum.North
    );
    expect(findClosestCardinalIndex(rad(275), headings([], -50))).toBe(
      CardinalDirectionEnum.North
    );
    expect(findClosestCardinalIndex(rad(275), headings([], -10))).toBe(
      CardinalDirectionEnum.West
    );
  });

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
