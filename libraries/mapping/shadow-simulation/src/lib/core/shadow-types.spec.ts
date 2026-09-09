import { describe, expect, it } from "vitest";

import {
  DEFAULT_SHADOW_GROUND_TEXEL_FIT,
  resolveShadowRenderQuality,
  SHADOW_BUFFER_FORMAT,
  SHADOW_BUFFER_LAYOUT,
  SHADOW_SUN_DISC_SAMPLES,
  SHADOW_QUALITY_PROFILES,
  SHADOW_QUALITY,
  resolveShadowTerrainQuality,
  type ShadowBufferLayout,
} from "./shadow-types";

describe("shadow render quality", () => {
  it("keeps adaptive shadow work independent from color resolution", () => {
    expect(resolveShadowRenderQuality().shadowAdaptiveQuality).toBe(true);
    const fixed = resolveShadowRenderQuality({ shadowAdaptiveQuality: false });
    expect(fixed.shadowAdaptiveQuality).toBe(false);
    expect(fixed).not.toHaveProperty("renderScale");
    expect(fixed).not.toHaveProperty("pixelRatio");
  });

  it("enables validated ground texel fitting by default", () => {
    expect(DEFAULT_SHADOW_GROUND_TEXEL_FIT).toBe(true);
    expect(resolveShadowRenderQuality().shadowGroundTexelFit).toBe(true);
  });

  it.each([
    [4, 64, 0],
    [16, 64, 2],
    [64, 64, 4],
    [256, 64, "max"],
  ] as const)(
    "uses hybrid HDR and the validated sample budget for quality %s",
    (quality, samples, msaa) => {
      expect(resolveShadowRenderQuality({}, quality)).toEqual({
        shadowAdaptiveQuality: true,
        shadowBufferLayout: SHADOW_BUFFER_LAYOUT.TILED,
        shadowBufferFormat: SHADOW_BUFFER_FORMAT.HDR_16_32,
        shadowSunDiscSamples: samples,
        shadowMsaaSamples: msaa,
        shadowGroundTexelFit: DEFAULT_SHADOW_GROUND_TEXEL_FIT,
      });
    }
  );
  it.each(Object.values(SHADOW_BUFFER_LAYOUT))(
    "retains the selected %s buffer layout without changing quality budgets",
    (shadowBufferLayout) => {
      expect(resolveShadowRenderQuality({ shadowBufferLayout })).toEqual({
        ...resolveShadowRenderQuality(),
        shadowBufferLayout,
      });
    }
  );

  it("falls back to tiled buffers for an unsupported layout", () => {
    expect(
      resolveShadowRenderQuality({
        shadowBufferLayout: "unsupported" as ShadowBufferLayout,
      }).shadowBufferLayout
    ).toBe(SHADOW_BUFFER_LAYOUT.TILED);
  });

  it("budgets terrain separately from the native-resolution color path", () => {
    const source = {
      id: "dem",
      tileSize: 512,
      minzoom: 5,
      maxzoom: 16,
      encoding: "terrarium" as const,
      url: "https://example.test/{z}/{x}/{y}.png",
      bounds: [6, 50, 8, 52] as const,
    };
    for (const quality of Object.values(SHADOW_QUALITY)) {
      const terrain = resolveShadowTerrainQuality(source, quality)!;
      const profile = SHADOW_QUALITY_PROFILES[quality];
      expect(terrain.errorTargetPixels).toBe(profile.terrainErrorPixels);
      expect(terrain.meshSegments).toBe(profile.terrainSegments);
      expect(terrain.maxzoom).toBe(16);
      expect(terrain.url).toBe(source.url);
      expect(profile).not.toHaveProperty("renderScale");
    }
    expect(resolveShadowTerrainQuality(undefined, 4)).toBeUndefined();
  });

  it.each(SHADOW_SUN_DISC_SAMPLES)(
    "retains explicit %s samples independently from map resolution",
    (shadowSunDiscSamples) => {
      expect(
        resolveShadowRenderQuality({ shadowSunDiscSamples }, 4)
          .shadowSunDiscSamples
      ).toBe(shadowSunDiscSamples);
    }
  );

  it("forces portable non-multisampled Float32 buffers", () => {
    expect(
      resolveShadowRenderQuality({
        shadowBufferFormat: SHADOW_BUFFER_FORMAT.HDR_32,
        shadowMsaaSamples: 4,
      }).shadowMsaaSamples
    ).toBe(0);
  });

  it("retains MSAA for hybrid FP16 scene and FP32 averaging", () => {
    expect(
      resolveShadowRenderQuality({
        shadowBufferFormat: SHADOW_BUFFER_FORMAT.HDR_16_32,
      })
    ).toMatchObject({
      shadowBufferFormat: SHADOW_BUFFER_FORMAT.HDR_16_32,
      shadowMsaaSamples: 4,
    });
  });

  it("keeps explicit disabled MSAA and ground fitting", () => {
    expect(
      resolveShadowRenderQuality({
        shadowMsaaSamples: 0,
        shadowGroundTexelFit: false,
      })
    ).toMatchObject({ shadowMsaaSamples: 0, shadowGroundTexelFit: false });
  });
});
