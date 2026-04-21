import { degToRadNumeric } from "@carma-units";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_CAMERA_LIMITER_OPTIONS,
  resolveCameraLimiterOptions,
} from "./camera-limiter-options";

describe("resolveCameraLimiterOptions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to defaults for invalid option types without throwing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resolved = resolveCameraLimiterOptions({
      pitchLimiter: null as never,
      maxPitchDeg: null as never,
      maxPitchCorrectionRangeDeg: NaN,
    });

    expect(resolved.pitchLimiter).toBe(
      DEFAULT_CAMERA_LIMITER_OPTIONS.pitchLimiter
    );
    expect(resolved.minCesiumPitch).toBeCloseTo(
      degToRadNumeric(DEFAULT_CAMERA_LIMITER_OPTIONS.maxPitchDeg - 90)!,
      12
    );
    expect(resolved.pitchCorrectionRange).toBeCloseTo(
      degToRadNumeric(
        DEFAULT_CAMERA_LIMITER_OPTIONS.maxPitchCorrectionRangeDeg
      )!,
      12
    );
    expect(warnSpy).toHaveBeenCalled();
  });

  it("clamps out-of-range CARMA-view degree values to the safe supported range", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resolved = resolveCameraLimiterOptions({
      maxPitchDeg: 22,
      maxPitchCorrectionRangeDeg: 50,
    });

    expect(resolved.minCesiumPitch).toBeCloseTo(degToRadNumeric(-68)!, 12);
    expect(resolved.pitchCorrectionRange).toBeCloseTo(degToRadNumeric(22)!, 12);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("keeps valid values unchanged and stays quiet", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resolved = resolveCameraLimiterOptions({
      pitchLimiter: false,
      maxPitchDeg: 22,
      maxPitchCorrectionRangeDeg: 8,
    });

    expect(resolved.pitchLimiter).toBe(false);
    expect(resolved.minCesiumPitch).toBeCloseTo(degToRadNumeric(-68)!, 12);
    expect(resolved.pitchCorrectionRange).toBeCloseTo(degToRadNumeric(8)!, 12);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
