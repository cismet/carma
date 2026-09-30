import { describe, expect, it } from "vitest";
import {
  PI,
  type CssPixels,
  type DevicePixels,
  type Radians,
  type Ratio,
} from "@carma-units";
import {
  nativePreviewWindow,
  nativePreviewTiles,
} from "./native-preview-window";
const css = (width: number, height: number) => ({
  width: width as CssPixels,
  height: height as CssPixels,
});
const device = (width: number, height: number) => ({
  width: width as DevicePixels,
  height: height as DevicePixels,
});
const offset = { x: 0 as CssPixels, y: 0 as CssPixels };
const principal = { xOffset: 0, yOffset: 0 };

describe("native TIFF display windows", () => {
  it("requests physical display pixels for the visible crop rather than the full TIFF", () => {
    const frame = nativePreviewWindow(
      css(800, 600),
      css(2000, 1000),
      device(10000, 5000),
      offset,
      principal,
      0 as Radians,
      2 as Ratio
    )!;
    expect(frame.source).toEqual({
      x: 3000,
      y: 1000,
      width: 4000,
      height: 3000,
    });
    expect(frame.target).toEqual({ width: 1600, height: 1200 });
    const tiles = nativePreviewTiles(frame, device(10000, 5000));
    expect(tiles).toHaveLength(2);
    expect(
      tiles.reduce(
        (sum, tile) => sum + tile.target.width * tile.target.height,
        0
      )
    ).toBe(1600 * 1200);
    expect(tiles[0].source.x).toBeLessThan(tiles[0].sample.x);
    expect(tiles[0].source.x + tiles[0].source.width).toBeGreaterThan(
      tiles[0].sample.x + tiles[0].sample.width
    );
    for (const tile of tiles) {
      const long = Math.max(tile.source.width, tile.source.height),
        short = Math.min(tile.source.width, tile.source.height);
      expect((tile.edge * tile.edge * short) / long).toBeLessThan(8_000_000);
      expect(tile.edge).toBeLessThanOrEqual(8192);
    }
  });
  it("inverts rotation and pan, clips off-image windows and never fetches outside the source", () => {
    const frame = nativePreviewWindow(
      css(800, 600),
      css(2000, 1000),
      device(10000, 5000),
      offset,
      principal,
      (PI / 2) as Radians,
      1 as Ratio
    )!;
    expect(frame.source.width).toBe(3000);
    // Outward integer rounding may retain one extra pixel after rotation.
    expect(frame.source.height).toBeGreaterThanOrEqual(4000);
    expect(frame.source.height).toBeLessThanOrEqual(4001);
    const none = nativePreviewWindow(
      css(800, 600),
      css(2000, 1000),
      device(10000, 5000),
      { x: 5000 as CssPixels, y: 0 as CssPixels },
      principal,
      0 as Radians,
      2 as Ratio
    );
    expect(none).toBeNull();
    const small = nativePreviewWindow(
      css(800, 600),
      css(400, 200),
      device(10000, 5000),
      offset,
      principal,
      0 as Radians,
      2 as Ratio
    )!;
    expect(small.source).toEqual({ x: 0, y: 0, width: 10000, height: 5000 });
    expect(small.target).toEqual({ width: 800, height: 400 });
    for (const tile of nativePreviewTiles(small, device(10000, 5000))) {
      expect(tile.source.x).toBeGreaterThanOrEqual(0);
      expect(tile.source.y).toBeGreaterThanOrEqual(0);
      expect(tile.source.x + tile.source.width).toBeLessThanOrEqual(10000);
      expect(tile.source.y + tile.source.height).toBeLessThanOrEqual(5000);
    }
  });
});
