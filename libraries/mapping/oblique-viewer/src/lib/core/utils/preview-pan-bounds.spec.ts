import { describe, expect, it } from "vitest";
import { PI, type CssPixels, type Radians, type Ratio } from "@carma-units";
import {
  clampPreviewPan,
  previewImageCoverage,
  type PreviewPanFrame,
} from "./preview-pan-bounds";
const point = (x: number, y: number) => ({
  x: x as CssPixels,
  y: y as CssPixels,
});
const frame = (
  width = 2000,
  height = 1800,
  roll = 0 as Radians
): PreviewPanFrame => ({
  viewport: { width: 800 as CssPixels, height: 600 as CssPixels },
  image: { width: width as CssPixels, height: height as CssPixels },
  principal: { xOffset: 0.1 as Ratio, yOffset: -0.05 as Ratio },
  roll,
});
const imageCentrePixel = (
  offset: ReturnType<typeof point>,
  value: PreviewPanFrame
) => ({
  x:
    0.5 -
    value.principal.xOffset -
    (Math.cos(value.roll) * offset.x + Math.sin(value.roll) * offset.y) /
      value.image.width,
  y:
    0.5 -
    value.principal.yOffset -
    (-Math.sin(value.roll) * offset.x + Math.cos(value.roll) * offset.y) /
      value.image.height,
});

describe("preview drag bounds", () => {
  it("does not recenter an edge entry on the first drag and restores ordinary bounds as coverage improves", () => {
    const value = frame(300, 600);
    value.principal = { xOffset: 0 as Ratio, yOffset: 0 as Ratio };
    const previousOffset = point(0, -300);
    expect(previewImageCoverage(previousOffset, value)).toBeLessThan(0.25);
    expect(clampPreviewPan(point(30, -300), value, { previousOffset })).toEqual(
      point(30, -300)
    );
    expect(clampPreviewPan(point(0, -330), value, { previousOffset })).toEqual(
      previousOffset
    );
    expect(clampPreviewPan(point(0, -280), value, { previousOffset })).toEqual(
      point(0, -280)
    );
    const recovered = point(0, -150);
    expect(previewImageCoverage(recovered, value)).toBeGreaterThan(0.25);
    const next = clampPreviewPan(point(0, -400), value, {
      previousOffset: recovered,
    });
    expect(previewImageCoverage(next, value)).toBeGreaterThanOrEqual(0.25);
  });

  it("allows each edge and corner to reach the viewport centre with an off-centre principal point", () => {
    const value = frame();
    expect(clampPreviewPan(point(50, 25), value)).toEqual(point(50, 25));
    const bottomLeft = clampPreviewPan(point(20000, -20000), value);
    expect(bottomLeft.x).toBeCloseTo(800, 6);
    expect(bottomLeft.y).toBeCloseTo(-810, 6);
    expect(imageCentrePixel(bottomLeft, value).x).toBeCloseTo(0, 9);
    expect(imageCentrePixel(bottomLeft, value).y).toBeCloseTo(1, 9);
    expect(previewImageCoverage(bottomLeft, value)).toBeCloseTo(0.25, 8);
    const topRight = clampPreviewPan(point(-20000, 20000), value);
    expect(topRight.x).toBeCloseTo(-1200, 6);
    expect(topRight.y).toBeCloseTo(990, 6);
    expect(imageCentrePixel(topRight, value).x).toBeCloseTo(1, 9);
    expect(imageCentrePixel(topRight, value).y).toBeCloseTo(0, 9);
    expect(previewImageCoverage(topRight, value)).toBeCloseTo(0.25, 8);
  });
  it("uses the rotated image and keeps at least 25% visible at a tilted corner", () => {
    const value = frame(4000, 4000, (PI / 4) as Radians);
    value.viewport.width = 1200 as CssPixels;
    value.principal = { xOffset: 0 as Ratio, yOffset: 0 as Ratio };
    const corner = point(0, 2000 * Math.SQRT2);
    expect(previewImageCoverage(corner, value)).toBeLessThan(0.25);
    const bounded = clampPreviewPan(point(0, 10000), value);
    const pixel = imageCentrePixel(bounded, value);
    expect(pixel.x).toBeGreaterThanOrEqual(0);
    expect(pixel.y).toBeGreaterThanOrEqual(0);
    expect(pixel.x).toBeLessThanOrEqual(1);
    expect(pixel.y).toBeLessThanOrEqual(1);
    expect(previewImageCoverage(bounded, value)).toBeGreaterThanOrEqual(0.25);
    expect(previewImageCoverage(bounded, value)).toBeLessThan(0.250000001);
  });
  it("updates the extent with zoom instead of using viewport-sized camera bounds", () => {
    const small = frame();
    const large = frame(4000, 3600);
    const first = clampPreviewPan(point(20000, 0), small);
    const second = clampPreviewPan(point(20000, 0), large);
    expect(first.x).toBe(800);
    expect(second.x).toBe(1600);
    expect(second.x).toBeGreaterThan(large.viewport.width / 2);
    expect(imageCentrePixel(first, small).x).toBe(0);
    expect(imageCentrePixel(second, large).x).toBe(0);
  });
  it("preserves the 25% viewport rule even when the centred image does not fill the viewport", () => {
    const value = frame(900, 900, (PI / 4) as Radians);
    value.viewport.width = 1200 as CssPixels;
    value.principal = { xOffset: 0 as Ratio, yOffset: 0 as Ratio };
    expect(previewImageCoverage(point(0, 0), value)).toBeLessThan(1);
    expect(previewImageCoverage(point(0, 0), value)).toBeGreaterThan(0.25);
    const bounded = clampPreviewPan(point(0, 10000), value);
    expect(previewImageCoverage(bounded, value)).toBeGreaterThanOrEqual(0.25);
  });
  it("does not enlarge a naturally small zoomed-out photo as a side effect of dragging", () => {
    const value = frame(300, 200);
    value.principal = { xOffset: 0 as Ratio, yOffset: 0 as Ratio };
    expect(clampPreviewPan(point(5000, 5000), value)).toEqual(point(150, 100));
    expect(previewImageCoverage(point(150, 100), value)).toBeCloseTo(0.125, 12);
  });
});
