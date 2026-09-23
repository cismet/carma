import { describe, expect, it } from "vitest";

import {
  TILES_CACHE_CEILING_BYTES,
  resolveTilesCacheBounds,
  resolveTilesCacheCeiling,
} from "./tile-cache-policy";
import { TILES_LOAD_POLICY } from "./tile-load-config";

const MIB = 1024 ** 2;
const GIB = 1024 ** 3;

const desktop = {
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/140",
  platform: "MacIntel",
  maxTouchPoints: 0,
};

describe("resolveTilesCacheCeiling", () => {
  it("caps iOS and iPadOS devices, including touch Macs", () => {
    expect(
      resolveTilesCacheCeiling({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
        platform: "iPhone",
        maxTouchPoints: 5,
      })
    ).toBe(TILES_CACHE_CEILING_BYTES.ios);
    expect(
      resolveTilesCacheCeiling({
        ...desktop,
        maxTouchPoints: 5,
        deviceMemoryGiB: 8,
      })
    ).toBe(TILES_CACHE_CEILING_BYTES.ios);
  });

  it("caps Android and other mobile devices", () => {
    expect(
      resolveTilesCacheCeiling({
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari",
        platform: "Linux armv8l",
        maxTouchPoints: 5,
        deviceMemoryGiB: 8,
      })
    ).toBe(TILES_CACHE_CEILING_BYTES.mobile);
  });

  it("scales Chromium desktops by device memory within bounds", () => {
    expect(resolveTilesCacheCeiling({ ...desktop, deviceMemoryGiB: 0.5 })).toBe(
      TILES_CACHE_CEILING_BYTES.desktopMinimum
    );
    expect(resolveTilesCacheCeiling({ ...desktop, deviceMemoryGiB: 4 })).toBe(
      4 * TILES_CACHE_CEILING_BYTES.perDeviceMemoryGiB
    );
    expect(resolveTilesCacheCeiling({ ...desktop, deviceMemoryGiB: 64 })).toBe(
      TILES_CACHE_CEILING_BYTES.desktopMaximum
    );
    expect(resolveTilesCacheCeiling(desktop)).toBe(
      TILES_CACHE_CEILING_BYTES.desktopDefault
    );
  });

  it("accepts explicit budgets up to 24 GiB, retaining the floor and safe defaults", () => {
    expect(
      resolveTilesCacheCeiling(desktop, {
        cacheBudgetBytes: 256 * MIB,
        cacheOverflowBytes: 256 * MIB,
      })
    ).toBe(512 * MIB);
    expect(
      resolveTilesCacheCeiling(desktop, {
        cacheBudgetBytes: 4 * GIB,
        cacheOverflowBytes: 4 * GIB,
      })
    ).toBe(8 * GIB);
    expect(
      resolveTilesCacheCeiling(desktop, {
        cacheBudgetBytes: 16 * MIB,
      })
    ).toBe(TILES_CACHE_CEILING_BYTES.floor);
    expect(
      resolveTilesCacheCeiling(desktop, {
        cacheBudgetBytes: 256 * MIB,
        cacheOverflowBytes: Number.POSITIVE_INFINITY,
      })
    ).toBe(TILES_CACHE_CEILING_BYTES.desktopDefault);
    expect(
      resolveTilesCacheCeiling(desktop, { cacheBudgetBytes: 24 * GIB })
    ).toBe(24 * GIB);
    expect(
      resolveTilesCacheCeiling(desktop, { cacheBudgetBytes: 128 * GIB })
    ).toBe(24 * GIB);
  });

  it("derives eviction bounds around the physical ceiling", () => {
    const bounds = resolveTilesCacheBounds({
      ceilingBytes: 1 * GIB,
      estimateBytes: 4 * MIB,
    });
    expect(bounds.minBytesSize).toBe(
      Math.floor(GIB * TILES_LOAD_POLICY.cacheRetentionFraction)
    );
    expect(bounds.maxBytesSize).toBe(
      GIB + TILES_LOAD_POLICY.cacheDriftSlackMinBytes
    );
    expect(
      resolveTilesCacheBounds({ ceilingBytes: GIB, estimateBytes: 16 * MIB })
        .maxBytesSize
    ).toBe(GIB + 8 * 16 * MIB);
  });
});
