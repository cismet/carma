import { describe, expect, it } from "vitest";
import { formatSignificantNumber } from "./formatSignificantNumber";

describe("formatSignificantNumber", () => {
  it("formats representative values with default locale and digits", () => {
    expect(formatSignificantNumber(12345)).toBe("12345");
    expect(formatSignificantNumber(123.456)).toBe("123");
    expect(formatSignificantNumber(12.3456)).toBe("12,3");
    expect(formatSignificantNumber(1.23456)).toBe("1,23");
    expect(formatSignificantNumber(0.123456)).toBe("0,123");
  });

  it("supports a custom locale and custom significant digits", () => {
    expect(
      formatSignificantNumber(12.3456, {
        significantDigits: 5,
        locale: "en-US",
      })
    ).toBe("12.346");
  });

  it("preserves sign for negative values", () => {
    expect(
      formatSignificantNumber(-0.123456, {
        significantDigits: 3,
        locale: "en-US",
      })
    ).toBe("-0.123");
  });

  it("clamps significant digits into a sane shared range", () => {
    expect(
      formatSignificantNumber(12.3456, {
        significantDigits: 0,
      })
    ).toBe("12");

    expect(
      formatSignificantNumber(12.3456789012345, {
        significantDigits: 99,
        locale: "en-US",
      })
    ).toBe("12.3456789012");
  });

  it('returns "0" for non-finite values and zero', () => {
    expect(formatSignificantNumber(Number.NaN)).toBe("0");
    expect(formatSignificantNumber(Number.POSITIVE_INFINITY)).toBe("0");
    expect(formatSignificantNumber(0)).toBe("0");
    expect(formatSignificantNumber(-0)).toBe("0");
  });
});
