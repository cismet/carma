import { describe, expect, it } from "vitest";
import { previewBackdropTint } from "./preview-backdrop";

describe("preview backdrop tint", () => {
  it("retains the legacy thirteen-percent black without a color-space shift", () => {
    expect(previewBackdropTint()).toEqual([0, 0, 0, 0.13]);
    expect(previewBackdropTint("rgba(0, 0, 0, 0.13)")).toEqual([0, 0, 0, 0.13]);
  });

  it("parses existing CSS style forms into normalized sRGB and alpha", () => {
    expect(previewBackdropTint("rgb(255 128 0 / 25%)")).toEqual([
      1,
      128 / 255,
      0,
      0.25,
    ]);
    expect(previewBackdropTint("rgba(100%, 50%, 0%, 0.5)")).toEqual([
      1, 0.5, 0, 0.5,
    ]);
    expect(previewBackdropTint("transparent")).toEqual([0, 0, 0, 0]);
    const hex = previewBackdropTint("#ff800040");
    expect(hex[0]).toBeCloseTo(1);
    expect(hex[1]).toBeCloseTo(128 / 255);
    expect(hex[2]).toBeCloseTo(0);
    expect(hex[3]).toBeCloseTo(64 / 255);
    expect(previewBackdropTint("#0002")).toEqual([0, 0, 0, 2 / 15]);
  });
});
