import { describe, expect, it } from "vitest";
import { formatFixedNumber } from "./numbers";

describe("formatFixedNumber", () => {
  it("trims trailing zeros by default", () => {
    expect(formatFixedNumber(12.34, 4)).toBe("12.34");
  });

  it("preserves trailing zeros when requested", () => {
    expect(formatFixedNumber(12.34, 4, { trimTrailingZeros: false })).toBe(
      "12.3400"
    );
  });

  it("returns undefined for non-finite numbers", () => {
    expect(formatFixedNumber(Number.NaN, 2)).toBeUndefined();
  });
});
