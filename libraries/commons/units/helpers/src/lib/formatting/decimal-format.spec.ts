import { describe, expect, it } from "vitest";
import { formatDecimalNumber } from "./decimal-format";

describe("formatDecimalNumber", () => {
  it("formats fixed decimal digits in de-DE by default", () => {
    expect(formatDecimalNumber(12.345)).toBe("12,35");
  });

  it("supports locale overrides", () => {
    expect(
      formatDecimalNumber(1234.5, {
        locale: "en-US",
        fractionDigits: 1,
        useGrouping: true,
      })
    ).toBe("1,234.5");
  });

  it("returns stringified non-finite values", () => {
    expect(formatDecimalNumber(Number.NaN)).toBe("NaN");
    expect(formatDecimalNumber(Number.POSITIVE_INFINITY)).toBe("Infinity");
  });
});
