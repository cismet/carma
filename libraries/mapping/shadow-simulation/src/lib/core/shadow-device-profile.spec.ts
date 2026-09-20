import { describe, expect, it, vi } from "vitest";
import {
  constrainMobileShadowTerrain,
  constrainMobileShadowRendering,
  resolveShadowDeviceClass,
} from "./shadow-device-profile";
import type { ShadowTerrainOptions } from "../contracts/shadow-simulation";
import { createInitialShadowSimulationState } from "./create-shadow-simulation-state";

const desktop = {
  userAgent: "Mozilla/5.0 (Macintosh)",
  platform: "MacIntel",
  maxTouchPoints: 0,
};
describe("mobile shadow admission", () => {
  it.each([
    [
      {
        ...desktop,
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6)",
        platform: "iPhone",
        maxTouchPoints: 5,
      },
      "phone",
    ],
    [{ ...desktop, userAgent: "Android 15; Mobile" }, "phone"],
    [{ ...desktop, mobile: true }, "phone"],
    [{ ...desktop, maxTouchPoints: 5 }, "tablet"],
    [{ ...desktop, userAgent: "Android 15" }, "tablet"],
    [{ ...desktop, platform: "Win32", maxTouchPoints: 10 }, "desktop"],
    [desktop, "desktop"],
  ] as const)(
    "classifies %j without using viewport width",
    (environment, expected) => {
      expect(resolveShadowDeviceClass(environment)).toBe(expected);
    }
  );
  it("bounds raster residency and in-flight work without replacing the source or coverage", () => {
    const terrain = {
      id: "source",
      tileSize: 512,
      maxzoom: 16,
      minzoom: 8,
    } as ShadowTerrainOptions;
    expect(constrainMobileShadowTerrain(terrain, true)).toEqual({
      ...terrain,
      meshSegments: 128,
      maximumMeshSegments: 128,
      maxSelectionTiles: 48,
      maxCachedMeshes: 64,
      maxCachedMeshBytes: 32 * 1024 ** 2,
      maxCacheBytes: 16 * 1024 ** 2,
      requestConcurrency: 2,
    });
    expect(constrainMobileShadowTerrain(terrain, false)).toBe(terrain);
    const smaller = {
      ...terrain,
      meshSegments: 32,
      requestConcurrency: 1,
      maxCachedMeshBytes: 1024,
    };
    expect(constrainMobileShadowTerrain(smaller, true)).toMatchObject({
      meshSegments: 32,
      requestConcurrency: 1,
      maxCachedMeshBytes: 1024,
    });
  });
  it("does not let persisted HDR/tiled/MSAA preferences bypass mobile admission", () => {
    expect(
      constrainMobileShadowRendering(
        {
          shadowBufferLayout: "tiled",
          shadowBufferFormat: "rgba32f",
          shadowMsaaSamples: "max",
        },
        true
      )
    ).toMatchObject({
      shadowBufferLayout: "mono",
      shadowBufferFormat: "rgba8",
      shadowMsaaSamples: 0,
    });
  });
  it("initializes controls with direct mobile shadows", () => {
    vi.stubGlobal("navigator", { ...desktop, userAgent: "iPhone" });
    try {
      expect(createInitialShadowSimulationState(undefined)).toMatchObject({
        softSunShadows: false,
        shadowQuality: 4,
        terrainQuality: "standard",
        meshCacheBudgetBytes: 96 * 1024 ** 2,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
