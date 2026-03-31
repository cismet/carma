import { describe, expect, it } from "vitest";

import { Easing } from "../easing-functions";
import {
  interpolateTimedNumber,
  readTimedInterpolationEasedProgress,
  readTimedInterpolationProgress,
} from "./timed-interpolation";
describe("timed interpolation", () => {
  it("uses absolute wall-clock progress instead of accumulating missed frames", () => {
    const frameTimes = [1000, 1016, 1032, 1210, 1750, 2000];

    const samples = frameTimes.map((nowMs) =>
      interpolateTimedNumber({
        start: 10,
        target: 110,
        startedAtMs: 1000,
        durationMs: 1000,
        nowMs,
        easing: Easing.CUBIC_OUT,
      })
    );

    expect(samples[0]).toBe(10);
    expect(samples[3]).toBeCloseTo(
      10 + (110 - 10) * Easing.CUBIC_OUT(0.21),
      10
    );
    expect(samples[4]).toBeCloseTo(
      10 + (110 - 10) * Easing.CUBIC_OUT(0.75),
      10
    );
    expect(samples[5]).toBe(110);
  });

  it("clamps late timestamps directly to the target state", () => {
    expect(
      readTimedInterpolationProgress({
        startedAtMs: 50,
        durationMs: 100,
        nowMs: 500,
      })
    ).toBe(1);

    expect(
      interpolateTimedNumber({
        start: 5,
        target: 25,
        startedAtMs: 50,
        durationMs: 100,
        nowMs: 500,
      })
    ).toBe(25);
  });

  it("applies easing to the absolute timestamp progress", () => {
    expect(
      readTimedInterpolationEasedProgress({
        startedAtMs: 0,
        durationMs: 1000,
        nowMs: 600,
        easing: Easing.CUBIC_OUT,
      })
    ).toBeCloseTo(Easing.CUBIC_OUT(0.6), 10);
  });
});
