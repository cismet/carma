import { describe, expect, it } from "vitest";

import {
  buildTransferData,
  DEFAULT_GEORADAR_ALPHA_RAMP,
  DEFAULT_GEORADAR_CLAMP_RANGE,
  DEFAULT_GEORADAR_COLOR_RAMP,
  DEFAULT_GEORADAR_TONE_CURVE,
  type CurvePoint,
} from "./GeoradarVolumeExplorer";

const LINEAR: CurvePoint[] = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];
const OPAQUE: CurvePoint[] = [
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

const rgbaAt = (data: Uint8Array, unit: number) => {
  const entryCount = data.length / 4;
  const index = Math.round(unit * (entryCount - 1)) * 4;
  return Array.from(data.slice(index, index + 4));
};

describe("buildTransferData", () => {
  it("clamps and stretches the selected source interval", () => {
    const data = buildTransferData(
      LINEAR,
      OPAQUE,
      { min: 0.25, max: 0.75 },
      "grayscale"
    );

    expect(rgbaAt(data, 0.2)).toEqual([0, 0, 0, 255]);
    expect(rgbaAt(data, 0.25)).toEqual([0, 0, 0, 255]);
    expect(rgbaAt(data, 0.75)).toEqual([255, 255, 255, 255]);
    expect(rgbaAt(data, 0.8)).toEqual([255, 255, 255, 255]);
  });

  it("inverts only the selected color ramp", () => {
    const normal = buildTransferData(
      LINEAR,
      LINEAR,
      { min: 0, max: 1 },
      "grayscale"
    );
    const inverted = buildTransferData(
      LINEAR,
      LINEAR,
      { min: 0, max: 1 },
      "grayscale",
      true
    );

    expect(rgbaAt(normal, 0)).toEqual([0, 0, 0, 0]);
    expect(rgbaAt(inverted, 0)).toEqual([255, 255, 255, 0]);
    expect(rgbaAt(normal, 1)).toEqual([255, 255, 255, 255]);
    expect(rgbaAt(inverted, 1)).toEqual([0, 0, 0, 255]);
  });

  it("interpolates opacity control points independently from color", () => {
    const opacityRamp: CurvePoint[] = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.25 },
      { x: 1, y: 1 },
    ];
    const data = buildTransferData(
      LINEAR,
      opacityRamp,
      { min: 0, max: 1 },
      "grayscale"
    );
    const midpoint = rgbaAt(data, 0.5);

    expect(midpoint.slice(0, 3)).toEqual([128, 128, 128]);
    expect(midpoint[3]).toBeGreaterThanOrEqual(63);
    expect(midpoint[3]).toBeLessThanOrEqual(65);
  });

  it("keeps mid-strength structure visible in the default transfer", () => {
    const data = buildTransferData(
      DEFAULT_GEORADAR_TONE_CURVE,
      DEFAULT_GEORADAR_ALPHA_RAMP,
      DEFAULT_GEORADAR_CLAMP_RANGE,
      DEFAULT_GEORADAR_COLOR_RAMP
    );
    const weak = rgbaAt(data, 0.15);
    const middle = rgbaAt(data, 0.4);
    const strong = rgbaAt(data, 0.7);

    expect(weak[3]).toBeLessThan(middle[3]);
    expect(middle[3]).toBeGreaterThan(20);
    expect(middle[3]).toBeLessThan(strong[3]);
    expect(middle.slice(0, 3)).not.toEqual(strong.slice(0, 3));
  });
});
