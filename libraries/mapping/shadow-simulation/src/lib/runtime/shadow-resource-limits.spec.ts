import { describe, expect, it } from "vitest";

import { resolveShadowResourceLimits } from "./shadow-resource-limits";

describe("resolveShadowResourceLimits", () => {
  it("caps iPhone shadow and accumulation targets before allocation", () => {
    expect(
      resolveShadowResourceLimits(16_384, {
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
        platform: "iPhone",
        maxTouchPoints: 5,
      })
    ).toEqual({
      maxShadowMapSize: 2_048,
      maxAccumulationPixels: 1_000_000,
    });
  });

  it("recognizes iPadOS desktop-style user agents", () => {
    expect(
      resolveShadowResourceLimits(16_384, {
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Safari/605.1.15",
        platform: "MacIntel",
        maxTouchPoints: 5,
      })
    ).toEqual({
      maxShadowMapSize: 4_096,
      maxAccumulationPixels: 2_000_000,
    });
  });

  it("keeps the renderer limit on desktop", () => {
    expect(
      resolveShadowResourceLimits(8_192, {
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        platform: "MacIntel",
        maxTouchPoints: 0,
      })
    ).toEqual({
      maxShadowMapSize: 8_192,
      maxAccumulationPixels: Number.POSITIVE_INFINITY,
    });
  });
});
