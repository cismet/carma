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
  forecastPreviewWindow,
  type NativePreviewWindow,
} from "./image-viewport-window";
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

describe("bounded preview zoom forecasting", () => {
  const window: NativePreviewWindow = {
    source: { x: 400 as DevicePixels, y: 300 as DevicePixels, ...device(400, 200) },
    target: device(200, 100),
  };
  it("prepares a larger centered source extent for zoom-out without growing physical buffers", () => {
    const next = forecastPreviewWindow(window, device(1200, 800), 0.5);
    expect(next).toEqual({ source: { x: 200, y: 200, width: 800, height: 400 }, target: { width: 200, height: 100 } });
    expect(next.target.width / next.source.width).toBe(0.25);
    expect(next.target.height / next.source.height).toBe(0.25);
  });
  it("clips expansion at native edges and reduces the matching target axis instead of stretching it", () => {
    const edge = { ...window, source: { ...window.source, x: 0 as DevicePixels, y: 250 as DevicePixels } };
    const next = forecastPreviewWindow(edge, device(2000, 1000), 0.5);
    expect(next).toEqual({ source: { x: 0, y: 150, width: 600, height: 400 }, target: { width: 150, height: 100 } });
    expect(next.target.width / next.target.height).toBe(next.source.width / next.source.height);
    expect(next.target.width).toBeLessThanOrEqual(edge.target.width);
    expect(next.target.height).toBeLessThanOrEqual(edge.target.height);
    const all = forecastPreviewWindow(window, device(1200, 800), 0.1);
    expect(all.source).toEqual({ x: 0, y: 0, width: 1200, height: 800 });
    expect(all.target).toEqual({ width: 60, height: 40 });
  });
  it("preserves zoom-in coverage for small steps and the existing centered crop for large steps", () => {
    expect(forecastPreviewWindow(window, device(1200, 800), 1.2)).toEqual({ source: window.source, target: { width: 240, height: 120 } });
    expect(forecastPreviewWindow(window, device(1200, 800), 2)).toEqual({ source: { x: 500, y: 350, width: 200, height: 100 }, target: window.target });
    expect(forecastPreviewWindow(window, device(1200, 800), 1)).toBe(window);
  });
  it.each([0, -1, Infinity, NaN])("rejects an invalid forecast factor %s", (factor) => {
    expect(() => forecastPreviewWindow(window, device(1200, 800), factor)).toThrow(RangeError);
  });
});

describe("native TIFF display windows", () => {
  it("uses a smaller configurable composition tile while covering every output pixel exactly once", () => {
    const frame = {
      source: {
        x: 0 as DevicePixels,
        y: 0 as DevicePixels,
        ...device(1600, 1200),
      },
      target: device(1600, 1200),
    };
    const tiles = nativePreviewTiles(frame, device(1600, 1200), 512);
    expect(tiles).toHaveLength(12);
    expect(
      tiles.every(({ target }) => target.width <= 512 && target.height <= 512)
    ).toBe(true);
    expect(
      tiles.reduce(
        (pixels, { target }) => pixels + target.width * target.height,
        0
      )
    ).toBe(1600 * 1200);
    expect(() => nativePreviewTiles(frame, device(1600, 1200), 0)).toThrow(
      RangeError
    );
  });
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
    expect(tiles).toHaveLength(4);
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
      expect(tile.target.width).toBeLessThanOrEqual(1024);
      expect(tile.target.height).toBeLessThanOrEqual(1024);
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
