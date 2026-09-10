import { describe, expect, it } from "vitest";

import {
  resolveShadowResourceLimits,
  resolveShadowDepthTexelBudget,
  resolveSupportedShadowMsaa,
  getShadowRenderCapabilities,
} from "./shadow-resource-limits";
import { resolveShadowRenderQuality } from "../core/shadow-types";
import { vi } from "vitest";
import type { WebGLRenderer } from "three";

describe("resolveShadowResourceLimits", () => {
  it.each([
    [4, 2048],
    [16, 3072],
    [64, 4096],
    [256, 4096],
  ] as const)(
    "allocates profile %s within its 1440p depth budget",
    (quality, side) => {
      expect(resolveShadowDepthTexelBudget(4096, quality)).toBe(side ** 2);
    }
  );
  it("scales depth work with physical pixels, never the color canvas", () => {
    expect(resolveShadowDepthTexelBudget(4096, 4, 1280 * 720)).toBe(1024 ** 2);
    expect(resolveShadowDepthTexelBudget(4096, 64, 2560 * 1440, 0.5)).toBe(
      2048 ** 2
    );
    expect(resolveShadowDepthTexelBudget(2048, 256)).toBe(2048 ** 2);
  });
  it("intersects color/depth MSAA support and reads GL limits only once", () => {
    const gl = {
      RENDERBUFFER: 1,
      DEPTH_COMPONENT24: 2,
      RGBA16F: 3,
      RGBA8: 4,
      SAMPLES: 5,
      MAX_RENDERBUFFER_SIZE: 6,
      getParameter: vi.fn(() => 8192),
      getInternalformatParameter: vi.fn(
        (_target, format) => new Int32Array(format === 3 ? [2] : [4, 2])
      ),
    };
    const renderer = {
      capabilities: { maxTextureSize: 16384 },
      getContext: () => gl,
    } as unknown as WebGLRenderer;
    const caps = getShadowRenderCapabilities(renderer);
    expect(caps.hdrSamples).toEqual([0, 2]);
    expect(caps.maxRenderbufferSize).toBe(8192);
    expect(
      resolveSupportedShadowMsaa(
        resolveShadowRenderQuality({}, 256),
        caps.hdrSamples
      )
    ).toBe(2);
    expect(
      resolveSupportedShadowMsaa(
        resolveShadowRenderQuality({}, 4),
        caps.hdrSamples
      )
    ).toBe(0);
    expect(getShadowRenderCapabilities(renderer)).toBe(caps);
    expect(gl.getParameter).toHaveBeenCalledTimes(1);
  });
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

  it("caps oversized desktop shadow targets at a safe HQ size", () => {
    expect(
      resolveShadowResourceLimits(16_384, {
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        platform: "MacIntel",
        maxTouchPoints: 0,
      })
    ).toEqual({
      maxShadowMapSize: 4_096,
      maxAccumulationPixels: Number.POSITIVE_INFINITY,
    });
  });

  it("keeps a smaller renderer limit on desktop", () => {
    expect(
      resolveShadowResourceLimits(4_096, {
        userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
        platform: "Linux x86_64",
        maxTouchPoints: 0,
      }).maxShadowMapSize
    ).toBe(4_096);
  });
});
