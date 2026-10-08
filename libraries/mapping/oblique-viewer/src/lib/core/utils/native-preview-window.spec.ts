import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  PI,
  type CssPixels,
  type DevicePixels,
  type Radians,
} from "@carma-units";
import { nativePreviewTextureTransform } from "./native-preview-window";
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
