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
      limiter: {
        pitch: {
          enabled: null as never,
          max: null as never,
          maxCorrectionRange: NaN,
        },
      },
    });

    expect(resolved.limiter.pitch.enabled).toBe(
      DEFAULT_CAMERA_LIMITER_OPTIONS.limiter.pitch.enabled
    );
    expect(resolved.limiter.pitch.minCesiumPitch).toBeCloseTo(
      degToRadNumeric(DEFAULT_CAMERA_LIMITER_OPTIONS.limiter.pitch.max - 90)!,
      12
    );
    expect(resolved.limiter.pitch.correctionRange).toBeCloseTo(
      degToRadNumeric(
        DEFAULT_CAMERA_LIMITER_OPTIONS.limiter.pitch.maxCorrectionRange
      )!,
      12
    );
    expect(warnSpy).toHaveBeenCalled();
  });

  it("clamps out-of-range CARMA-view degree values to the safe supported range", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resolved = resolveCameraLimiterOptions({
      limiter: {
        pitch: {
          max: 22,
          maxCorrectionRange: 50,
        },
      },
    });

    expect(resolved.limiter.pitch.minCesiumPitch).toBeCloseTo(
      degToRadNumeric(-68)!,
      12
    );
    expect(resolved.limiter.pitch.correctionRange).toBeCloseTo(
      degToRadNumeric(22)!,
      12
    );
    expect(warnSpy).toHaveBeenCalled();
  });

  it("keeps valid values unchanged and stays quiet", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resolved = resolveCameraLimiterOptions({
      limiter: {
        pitch: {
          enabled: false,
          max: 22,
          maxCorrectionRange: 8,
        },
      },
    });

    expect(resolved.limiter.pitch.enabled).toBe(false);
    expect(resolved.limiter.pitch.minCesiumPitch).toBeCloseTo(
      degToRadNumeric(-68)!,
      12
    );
    expect(resolved.limiter.pitch.correctionRange).toBeCloseTo(
      degToRadNumeric(8)!,
      12
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
