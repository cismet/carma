import { describe, expect, it } from "vitest";

import { formatDegrees } from "./angle-format";
describe("formatDegrees", () => {
  it("formats degrees with the default degree symbol", () => {
    expect(formatDegrees(12.345)).toBe("12,35°");
  });

  it("supports locale overrides", () => {
    expect(
      formatDegrees(-13.5, {
        locale: "en-US",
        fractionDigits: 1,
      })
    ).toBe("-13.5°");
  });

  it("supports explicit unit suppression", () => {
    expect(
      formatDegrees(90, {
        unitSymbol: false,
      })
    ).toBe("90,00");
  });
});
