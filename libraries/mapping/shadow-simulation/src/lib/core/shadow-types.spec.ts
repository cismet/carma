import { describe, expect, it } from "vitest";

import {
  DEFAULT_SHADOW_GROUND_TEXEL_FIT,
  resolveShadowRenderQuality,
  SHADOW_BUFFER_FORMAT,
  SHADOW_SUN_DISC_SAMPLES,
  SHADOW_QUALITY_PROFILES,
  SHADOW_QUALITY,
  resolveShadowTerrainQuality,
} from "./shadow-types";

describe("shadow render quality", () => {
  it("enables validated ground texel fitting by default", () => {
    expect(DEFAULT_SHADOW_GROUND_TEXEL_FIT).toBe(true);
    expect(resolveShadowRenderQuality().shadowGroundTexelFit).toBe(true);
  });

  it.each([
    [4, 128, 0],
    [16, 256, 2],
    [64, 512, 4],
    [256, 8192, "max"],
  ] as const)(
    "uses hybrid HDR and the validated sample budget for quality %s",
    (quality, samples, msaa) => {
      expect(resolveShadowRenderQuality({}, quality)).toEqual({
        shadowBufferFormat: SHADOW_BUFFER_FORMAT.HDR_16_32,
        shadowSunDiscSamples: samples,
        shadowMsaaSamples: msaa,
        shadowGroundTexelFit: DEFAULT_SHADOW_GROUND_TEXEL_FIT,
      });
    }
  );
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
