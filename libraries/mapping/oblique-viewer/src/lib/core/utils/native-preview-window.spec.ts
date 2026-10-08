import { Matrix3, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  PI,
  type CssPixels,
  type DevicePixels,
  type Radians,
  type Ratio,
} from "@carma-units";
import {
  nativePreviewTextureTransform,
  projectedNativePreviewWindow,
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

describe("scene image UV projection", () => {
  it("matches screen center, physical image edges, and a cropped native texture", () => {
    const transform = nativePreviewTextureTransform(
      css(800, 600),
      css(1600, 800),
      device(8000, 4000),
      offset,
      principal,
      0 as Radians
    );
    expect(new Vector3(0.5, 0.5, 1).applyMatrix3(transform).toArray()).toEqual([
      0.5, 0.5, 1,
    ]);
    expect(new Vector3(0, 0, 1).applyMatrix3(transform).toArray()).toEqual([
      0.25, 0.125, 1,
    ]);
    const crop = nativePreviewTextureTransform(
      css(800, 600),
      css(1600, 800),
      device(8000, 4000),
      offset,
      principal,
      0 as Radians,
      {
        x: 3000 as DevicePixels,
        y: 1000 as DevicePixels,
        width: 4000 as DevicePixels,
        height: 3000 as DevicePixels,
      }
    );
    const center = new Vector3(0.5, 0.5, 1).applyMatrix3(crop);
    expect(center.x).toBeCloseTo(0.25);
    expect(center.y).toBeCloseTo(2 / 3);
  });
  it("keeps sensor center aligned through roll, principal offset and camera-plane pan", () => {
    const transform = nativePreviewTextureTransform(
      css(800, 600),
      css(1600, 800),
      device(8000, 4000),
      { x: 80 as CssPixels, y: -30 as CssPixels },
      { xOffset: 0.1, yOffset: -0.15 },
      (PI / 2) as Radians
    );
    const center = new Vector3(600 / 800, 1 - 430 / 600, 1).applyMatrix3(
      transform
    );
    expect(center.x).toBeCloseTo(0.5);
    expect(center.y).toBeCloseTo(0.5);
  });
});

describe("finite-plane native pixel window", () => {
  it("uses bottom-left homogeneous sensor coordinates and the highest directional density", () => {
    const window = projectedNativePreviewWindow(
      new Matrix3().set(0.4, 0, 0.2, 0, 0.25, 0.5, 0, 0, 1),
      css(800, 600),
      device(10000, 8000),
      2 as Ratio
    )!;
    expect(window.source).toEqual({
      x: 2000,
      y: 2000,
      width: 4001,
      height: 2000,
    });
    expect(window.target.width / window.source.width).toBeCloseTo(0.6, 3);
    expect(window.target.height / window.source.height).toBeCloseTo(0.6, 3);
  });

  it("divides by projective depth and clamps the crop to native sensor bounds", () => {
    const window = projectedNativePreviewWindow(
      new Matrix3().set(1, 0, 0, 0, 1, 0, 0.5, 0, 1),
      css(800, 600),
      device(10000, 8000),
      2 as Ratio
    )!;
    expect(window.source).toEqual({ x: 0, y: 0, width: 6667, height: 8000 });
    expect(window.target.width).toBeLessThanOrEqual(window.source.width);
    expect(window.target.height).toBeLessThanOrEqual(window.source.height);
    expect(window.target.width * window.target.height).toBeLessThan(
      4 * 800 * 600 * 4 + 10000
    );
    const clipped = projectedNativePreviewWindow(
      new Matrix3().set(0.4, 0, -0.2, 0, 0.5, 0.8, 0, 0, 1),
      css(800, 600),
      device(10000, 8000),
      1 as Ratio
    )!;
    expect(clipped.source).toEqual({ x: 0, y: 0, width: 2000, height: 1600 });
  });

  it("does not request an unrelated fallback crop for off-image, singular or horizon-crossing mappings", () => {
    for (const matrix of [
      new Matrix3().set(1, 0, 2, 0, 1, 0, 0, 0, 1),
      new Matrix3().set(1, 0, 0, 0, 1, 0, 1, 0, -0.5),
      new Matrix3().set(1, 0, 0, 0, 0, 0, 0, 0, 1),
    ])
      expect(
        projectedNativePreviewWindow(
          matrix,
          css(800, 600),
          device(10000, 8000),
          1 as Ratio
        )
      ).toBeNull();
  });
});
