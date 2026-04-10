import { describe, expect, it } from "vitest";

import {
  formatLengthMeters,
  formatLengthMetersScientificParts,
  formatLengthMetersScientific,
  LENGTH_UNIT_MODE,
} from "./length-format";
describe("formatLengthMeters", () => {
  it("formats adaptive metric lengths", () => {
    expect(
      formatLengthMeters(1234.56, {
        locale: "en-US",
      })
    ).toBe("1.23 km");
  });

  it("supports explicit meter mode", () => {
    expect(
      formatLengthMeters(12.345, {
        locale: "en-US",
        maximumFractionDigitsMeters: 1,
        unitMode: LENGTH_UNIT_MODE.METERS,
      })
    ).toBe("12.3 m");
  });
});

describe("formatLengthMetersScientific", () => {
  it("formats large lengths as plain scientific text", () => {
    expect(
      formatLengthMetersScientific(10_000_000_000, {
        locale: "en-US",
      })
    ).toBe("1 × 10^10 m");
  });
});

describe("formatLengthMetersScientificParts", () => {
  it("formats large lengths with separated scientific parts", () => {
    expect(
      formatLengthMetersScientificParts(10_000_000_000, {
        locale: "en-US",
      })
    ).toEqual({
      coefficient: "1",
      exponent: 10,
      unit: "m",
      text: "1 × 10^10 m",
    });
  });

  it("supports locale and significant-digit overrides", () => {
    expect(
      formatLengthMetersScientificParts(12_345, {
        locale: "de-DE",
        significantDigits: 4,
      })
    ).toEqual({
      coefficient: "1,235",
      exponent: 4,
      unit: "m",
      text: "1,235 × 10^4 m",
    });
  });

  it("formats small lengths with negative exponents", () => {
    expect(
      formatLengthMetersScientificParts(0.1, {
        locale: "en-US",
      })
    ).toEqual({
      coefficient: "1",
      exponent: -1,
      unit: "m",
      text: "1 × 10^-1 m",
    });
  });

  it("returns plain fallback parts for zero and non-finite values", () => {
    expect(formatLengthMetersScientificParts(0)).toEqual({
      coefficient: "0",
      exponent: null,
      unit: "m",
      text: "0 m",
    });
    expect(formatLengthMetersScientificParts(Number.NaN)).toEqual({
      coefficient: "NaN",
      exponent: null,
      unit: "m",
      text: "NaN m",
    });
  });
});
