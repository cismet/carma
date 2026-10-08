import { describe, expect, it } from "vitest";
import type { DevicePixels } from "@carma-units";
import { resamplePreviewRgb } from "./resample-preview-rgb";
const px = (n: number) => n as DevicePixels;
const rect = (width: number, height: number) => ({
  x: px(0),
  y: px(0),
  width: px(width),
  height: px(height),
});

describe("native preview RGB resampling", () => {
  it("preserves independent RGB channels and a constant image while downsampling", () => {
    const source = Uint8ClampedArray.from(
      Array.from({ length: 16 }, () => [197, 51, 139, 255]).flat()
    );
    const out = resamplePreviewRgb(
      source,
      px(4),
      px(4),
      px(2),
      px(2),
      rect(4, 4)
    );
    expect([...out]).toEqual(
      Array.from({ length: 4 }, () => [197, 51, 139, 255]).flat()
    );
  });
  it("shows native source pixels at 200% instead of blurring them", () => {
    const source = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]);
    const out = resamplePreviewRgb(
      source,
      px(2),
      px(1),
      px(4),
      px(2),
      rect(2, 1)
    );
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 4; x++) {
        expect([...out.slice((y * 4 + x) * 4, (y * 4 + x + 1) * 4)]).toEqual(
          x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255]
        );
      }
  });
  it("uses linear-light filtering and samples inside an overlapping tile halo", () => {
    const source = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    const out = resamplePreviewRgb(
      source,
      px(2),
      px(1),
      px(1),
      px(1),
      rect(2, 1)
    );
    expect(out[0]).toBeGreaterThan(175);
    expect(out[0]).toBeLessThan(200);
    const halo = new Uint8ClampedArray([
      0, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 0, 255,
    ]);
    const crop = resamplePreviewRgb(halo, px(4), px(1), px(8), px(4), {
      x: px(1),
      y: px(0),
      width: px(2),
      height: px(1),
    });
    expect([...crop.slice(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...crop.slice(7 * 4, 8 * 4)]).toEqual([0, 0, 255, 255]);
  });
});
