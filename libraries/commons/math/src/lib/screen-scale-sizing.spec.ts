import { describe, expect, it } from "vitest";

import {
  computeCircleSegments,
  createSteppedScreenScaler,
  getAxisSampleWorldStep,
  shouldRestepScreenScale,
  snapToNiceStep,
} from "./screen-scale-sizing";

describe("screen scale sizing", () => {
  it("holds a rounded world size inside the projection-scale hysteresis band", () => {
    const scaler = createSteppedScreenScaler();

    expect(snapToNiceStep(3.8)).toBe(5);
    expect(
      scaler.resolve({
        currentScale: 10,
        fallback: 1,
        quantize: true,
        targetScreenPx: 100,
      })
    ).toBe(10);
    expect(
      scaler.resolve({
        currentScale: 15,
        fallback: 1,
        quantize: true,
        targetScreenPx: 100,
      })
    ).toBe(10);
    expect(
      scaler.resolve({
        currentScale: 20,
        fallback: 1,
        quantize: true,
        targetScreenPx: 100,
      })
    ).toBe(5);
    expect(shouldRestepScreenScale(10, 19)).toBe(false);
    expect(shouldRestepScreenScale(10, 20)).toBe(true);
  });

  it("bounds circle tessellation by the configured segment limits", () => {
    expect(computeCircleSegments(0)).toBe(48);
    expect(computeCircleSegments(100)).toBe(252);
    expect(computeCircleSegments(10_000)).toBe(256);
  });

  it("returns 0 for a degenerate axis unit sample", () => {
    expect(getAxisSampleWorldStep(0, 48, 0.25, 500)).toBe(0);
    expect(getAxisSampleWorldStep(Number.NaN, 48, 0.25, 500)).toBe(0);
  });

  it("clamps the axis sample world step to the configured range", () => {
    expect(getAxisSampleWorldStep(24, 48, 0.25, 500)).toBe(2);
    expect(getAxisSampleWorldStep(1000, 48, 0.25, 500)).toBe(0.25);
    expect(getAxisSampleWorldStep(0.01, 48, 0.25, 500)).toBe(500);
  });
});
