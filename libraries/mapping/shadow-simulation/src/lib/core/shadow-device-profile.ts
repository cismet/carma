import type { ShadowTerrainOptions } from "../contracts/shadow-simulation";
import {
  SHADOW_BUFFER_FORMAT,
  SHADOW_BUFFER_LAYOUT,
  type ShadowRenderQualityOptions,
} from "./shadow-types";

export type ShadowDeviceEnvironment = Readonly<{
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  mobile?: boolean;
}>;

export const readShadowDeviceEnvironment = (): ShadowDeviceEnvironment => {
  if (typeof navigator === "undefined")
    return { userAgent: "", platform: "", maxTouchPoints: 0 };
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    mobile: (navigator as Navigator & { userAgentData?: { mobile?: boolean } })
      .userAgentData?.mobile,
  };
};

// Device class is a conservative admission policy, not a measurement of free RAM.
export const resolveShadowDeviceClass = (
  environment = readShadowDeviceEnvironment()
) => {
  if (
    /iPhone|iPod|Android.*Mobile/i.test(environment.userAgent) ||
    environment.mobile
  )
    return "phone";
  if (
    /iPad|Android/i.test(environment.userAgent) ||
    (environment.platform === "MacIntel" && environment.maxTouchPoints > 1)
  )
    return "tablet";
  return "desktop";
};

export const usesMobileShadowBaseline = () =>
  resolveShadowDeviceClass() !== "desktop";
export const MOBILE_MESH_CACHE_BYTES = 96 * 1024 ** 2;

// Decision: ../../../three/README.md#mobile-shadow-baseline
// Bound both resident geometry and in-flight builds; a texture-size cap alone
// does not constrain the CPU/GPU terrain working set.
export const constrainMobileShadowTerrain = (
  terrain: ShadowTerrainOptions | undefined,
  mobile = usesMobileShadowBaseline()
): ShadowTerrainOptions | undefined =>
  !terrain || !mobile
    ? terrain
    : {
        ...terrain,
        meshSegments: Math.min(terrain.meshSegments ?? terrain.tileSize, 128),
        maximumMeshSegments: Math.min(terrain.maximumMeshSegments ?? 128, 128),
        maxSelectionTiles: Math.min(terrain.maxSelectionTiles ?? 48, 48),
        maxCachedMeshes: Math.min(terrain.maxCachedMeshes ?? 64, 64),
        maxCachedMeshBytes: Math.min(
          terrain.maxCachedMeshBytes ?? 32 * 1024 ** 2,
          32 * 1024 ** 2
        ),
        maxCacheBytes: Math.min(
          terrain.maxCacheBytes ?? 16 * 1024 ** 2,
          16 * 1024 ** 2
        ),
        requestConcurrency: Math.min(terrain.requestConcurrency ?? 2, 2),
      };

export const constrainMobileShadowRendering = (
  options: ShadowRenderQualityOptions,
  mobile = usesMobileShadowBaseline()
): ShadowRenderQualityOptions =>
  mobile
    ? {
        ...options,
        shadowAdaptiveQuality: true,
        shadowBufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
        shadowBufferFormat: SHADOW_BUFFER_FORMAT.SDR_8,
        shadowMsaaSamples: 0,
      }
    : options;
