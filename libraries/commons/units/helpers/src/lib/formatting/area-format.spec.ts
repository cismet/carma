import { describe, expect, it } from "vitest";
import { formatAreaSquareMetersAdaptive } from "./area-format";

describe("formatAreaSquareMetersAdaptive", () => {
  it("formats small areas in square meters", () => {
    expect(
      formatAreaSquareMetersAdaptive(123.456, {
        locale: "en-US",
      })
    ).toBe("123 m²");
  });

  it("formats larger areas in hectares", () => {
    expect(
      formatAreaSquareMetersAdaptive(54321, {
        locale: "de-DE",
      })
    ).toBe("5,43 ha");
  });

  it("supports custom significant digits and threshold", () => {
    expect(
      formatAreaSquareMetersAdaptive(2500, {
        locale: "en-US",
        significantDigits: 4,
        hectareThresholdSquareMeters: 2000,
      })
    ).toBe("0.25 ha");
  });

  it('returns "0 m²" for invalid or non-positive values', () => {
    expect(formatAreaSquareMetersAdaptive(Number.NaN)).toBe("0 m²");
    expect(formatAreaSquareMetersAdaptive(0)).toBe("0 m²");
    expect(formatAreaSquareMetersAdaptive(-5)).toBe("0 m²");
  });
});
