import { describe, expect, it } from "vitest";
import {
  resolveAreaFillGridPitchMeters,
  resolveMapLibreMeasurementStyle,
  resolveRulerMajorPitchMeters,
  resolveRulerPitchMeters,
} from "./maplibre-measurement-style";

describe("resolveAreaFillGridPitchMeters", () => {
  it("picks the 1-2-5 pitch that spans at least ten pixels", () => {
    // 3 px per metre: 2 m is 6 px, 5 m is 15 px.
    expect(resolveAreaFillGridPitchMeters(3)).toBe(5);
    // 0.012 px per metre: 1000 m is 12 px.
    expect(resolveAreaFillGridPitchMeters(0.012)).toBe(1000);
  });

  it("never goes below one metre, however close the view", () => {
    expect(resolveAreaFillGridPitchMeters(50)).toBe(1);
    expect(resolveAreaFillGridPitchMeters(250)).toBe(1);
  });

  it("spans ten to twenty-five pixels wherever a metre fits", () => {
    for (const pixelsPerMeter of [0.5, 1, 4, 7, 10]) {
      const px =
        resolveAreaFillGridPitchMeters(pixelsPerMeter) * pixelsPerMeter;
      expect(px).toBeGreaterThanOrEqual(10);
      expect(px).toBeLessThanOrEqual(25);
    }
  });

  it("falls back to the coarsest pitch without a scale", () => {
    expect(resolveAreaFillGridPitchMeters(0)).toBe(1000);
  });
});

describe("resolveMapLibreMeasurementStyle", () => {
  it("keeps the defaults for anything missing or malformed", () => {
    const style = resolveMapLibreMeasurementStyle({
      checkerDarkShare: 2,
      gridPitchSeriesMeters: [5, -1, 2],
      crosshairArmCssPx: Number.NaN,
    });
    expect(style.checkerDarkShare).toBe(1);
    expect(style.gridPitchSeriesMeters).toEqual([2, 5]);
    expect(style.crosshairArmCssPx).toBe(3);
    expect(style.visibleOpacityFactor).toBe(1.8);
  });

  it("drives the pitch with its own series", () => {
    const style = resolveMapLibreMeasurementStyle({
      gridPitchSeriesMeters: [0.5, 5],
      gridMinPitchCssPx: 20,
    });
    expect(resolveAreaFillGridPitchMeters(50, style)).toBe(0.5);
    expect(resolveAreaFillGridPitchMeters(5, style)).toBe(5);
  });
});

describe("resolveRulerMajorPitchMeters", () => {
  it("marks every fifth beat: 5, 10, 25, 50 and 100 m over the 1-2-5 beats", () => {
    expect(resolveRulerMajorPitchMeters(1)).toBe(5);
    expect(resolveRulerMajorPitchMeters(2)).toBe(10);
    expect(resolveRulerMajorPitchMeters(5)).toBe(25);
    expect(resolveRulerMajorPitchMeters(10)).toBe(50);
    expect(resolveRulerMajorPitchMeters(20)).toBe(100);
  });

  it("falls back to 5 m without a beat", () => {
    expect(resolveRulerMajorPitchMeters(0)).toBe(5);
  });
});

describe("resolveRulerPitchMeters", () => {
  it("gives every beat at least 32 pixels", () => {
    for (const pixelsPerMeter of [0.2, 1, 3, 10, 40, 120]) {
      const pitch = resolveRulerPitchMeters(pixelsPerMeter);
      expect(pitch * pixelsPerMeter).toBeGreaterThanOrEqual(32);
    }
    // 20 px per metre: a 1 m beat is 20 px, a 2 m beat 40 px.
    expect(resolveRulerPitchMeters(20)).toBe(2);
    expect(resolveRulerPitchMeters(40)).toBe(1);
  });
});
