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
      minPitchDeg: null as never,
      minPitchRangeDeg: NaN,
    });

    expect(resolved.pitchLimiter).toBe(
      DEFAULT_CAMERA_LIMITER_OPTIONS.pitchLimiter
    );
    expect(resolved.minPitch).toBeCloseTo(
      degToRadNumeric(DEFAULT_CAMERA_LIMITER_OPTIONS.minPitchDeg - 90)!,
      12
    );
    expect(resolved.minPitchRange).toBeCloseTo(
      degToRadNumeric(DEFAULT_CAMERA_LIMITER_OPTIONS.minPitchRangeDeg)!,
      12
    );
    expect(warnSpy).toHaveBeenCalled();
  });

  it("clamps out-of-range degree values to the safe supported range", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resolved = resolveCameraLimiterOptions({
      minPitchDeg: 22,
      minPitchRangeDeg: 50,
    });

    expect(resolved.minPitch).toBeCloseTo(degToRadNumeric(-68)!, 12);
    expect(resolved.minPitchRange).toBeCloseTo(degToRadNumeric(22)!, 12);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("keeps valid values unchanged and stays quiet", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resolved = resolveCameraLimiterOptions({
      pitchLimiter: false,
      minPitchDeg: 22,
      minPitchRangeDeg: 8,
    });

    expect(resolved.pitchLimiter).toBe(false);
    expect(resolved.minPitch).toBeCloseTo(degToRadNumeric(-68)!, 12);
    expect(resolved.minPitchRange).toBeCloseTo(degToRadNumeric(8)!, 12);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
