import { PerspectiveCamera } from "three";
import { describe, expect, it } from "vitest";

import {
  measurePlateShadowBanding,
  measureSunShadowBanding,
  sunDiscEdgeVisibility,
} from "./sun-shadow-banding";

const offsets = Array.from(
  { length: 513 },
  (_, index) => -1.2 + (index * 2.4) / 512
);
const expected = offsets.map(sunDiscEdgeVisibility);

describe("sun shadow banding regression metric", () => {
  it("matches the uniform-disc marginal endpoints and symmetry", () => {
    expect(sunDiscEdgeVisibility(-2)).toBe(1);
    expect(sunDiscEdgeVisibility(0)).toBe(0.5);
    expect(sunDiscEdgeVisibility(2)).toBe(0);
    expect(
      sunDiscEdgeVisibility(0.4) + sunDiscEdgeVisibility(-0.4)
    ).toBeCloseTo(1);
  });

  it("passes an ideal smooth disc profile with zero residual", () => {
    const result = measureSunShadowBanding(
      [expected, expected, expected],
      expected
    );
    expect(result.coherentP95Codes).toBeCloseTo(0);
    expect(result.coherentMaxCodes).toBeCloseTo(0);
    expect(result.profileRmsCodes).toBeCloseTo(0);
    expect(result.widthErrorPercent).toBeCloseTo(0);
    expect(result.passes).toBe(true);
  });

  it.each([-16, 16, 12.5, 100.25])(
    "registers an edge translation of %s pixels without hiding its raw RMS",
    (shift) => {
      const translated = offsets.map((offset) =>
        sunDiscEdgeVisibility(offset - (shift * 2.4) / 512)
      );
      const result = measureSunShadowBanding([translated], expected);
      expect(result.centerOffsetPixels).toBeCloseTo(shift, 2);
      expect(result.coherentP95Codes).toBeLessThan(0.01);
      expect(result.coherentMaxCodes).toBeLessThan(0.02);
      expect(result.profileRmsCodes).toBeGreaterThan(5);
      expect(Math.abs(result.widthErrorPercent ?? Infinity)).toBeLessThan(0.01);
      expect(result.passes).toBe(true);
    }
  );

  it("does not fit away a width distortion while registering translation", () => {
    const translatedAndBroadened = offsets.map((offset) =>
      sunDiscEdgeVisibility((offset - (16 * 2.4) / 512) / 1.2)
    );
    const result = measureSunShadowBanding([translatedAndBroadened], expected);
    expect(result.centerOffsetPixels).toBeCloseTo(16, 2);
    expect(result.widthErrorPercent).toBeGreaterThan(15);
    expect(result.passes).toBe(false);
  });

  it("excludes translated score windows outside a cropped non-flat reference", () => {
    const step = 1.6 / 512;
    const croppedOffsets = Array.from(
      { length: 513 },
      (_, index) => -0.8 + index * step
    );
    const croppedExpected = croppedOffsets.map(sunDiscEdgeVisibility);
    const actual = croppedOffsets.map((offset) =>
      sunDiscEdgeVisibility(offset - 20 * step)
    );
    const result = measureSunShadowBanding([actual], croppedExpected);
    expect(result.centerOffsetPixels).toBeCloseTo(20, 2);
    expect(result.coherentMaxCodes).toBeLessThan(0.02);
    expect(result.passes).toBe(true);
  });

  it("rejects coherent visibility quantization steps", () => {
    const stepped = expected.map((value) => Math.round(value * 16) / 16);
    const result = measureSunShadowBanding(
      [stepped, stepped, stepped],
      expected
    );
    expect(result.coherentMaxCodes).toBeGreaterThan(1);
    expect(result.passes).toBe(false);
  });

  it.each([0.8, 1.2])(
    "rejects a smooth profile with distorted width %s",
    (scale) => {
      const broadened = offsets.map((offset) =>
        sunDiscEdgeVisibility(offset / scale)
      );
      const result = measureSunShadowBanding([broadened], expected);
      expect(Math.abs(result.widthErrorPercent ?? 0)).toBeGreaterThan(5);
      expect(result.passes).toBe(false);
    }
  );

  it("does not reward heavy smoothing of a quantized shadow edge", () => {
    const stepped = expected.map((value) => Math.round(value * 16) / 16);
    const blurred = stepped.map((_, index) => {
      let sum = 0;
      for (let offset = -90; offset <= 90; offset += 1) {
        sum +=
          stepped[Math.max(0, Math.min(stepped.length - 1, index + offset))];
      }
      return sum / 181;
    });
    const result = measureSunShadowBanding([blurred], expected);
    expect(Math.abs(result.widthErrorPercent ?? 0)).toBeGreaterThan(5);
    expect(result.passes).toBe(false);
  });

  it("rejects absent, short, mismatched and non-finite profiles", () => {
    expect(() => measureSunShadowBanding([], expected)).toThrow();
    expect(() =>
      measureSunShadowBanding([expected.slice(1)], expected)
    ).toThrow();
    expect(() =>
      measureSunShadowBanding([expected.slice(0, 64)], expected.slice(0, 64))
    ).toThrow();
    expect(() =>
      measureSunShadowBanding([[NaN, ...expected.slice(1)]], expected)
    ).toThrow();
    expect(() =>
      measureSunShadowBanding([expected], [Infinity, ...expected.slice(1)])
    ).toThrow();
    const narrow = Array.from({ length: 65 }, (_, i) =>
      sunDiscEdgeVisibility((i - 32) / 5)
    );
    expect(() => measureSunShadowBanding([narrow], narrow)).toThrow(
      "Insufficient visible penumbra"
    );
  });

  it("rejects incompatible readback dimensions", () => {
    expect(() =>
      measurePlateShadowBanding(
        new Float32Array(4),
        new PerspectiveCamera(),
        2,
        2,
        {
          distanceMeters: 25,
          elevationDegrees: 45,
        }
      )
    ).toThrow("Image dimensions differ");
  });
});
