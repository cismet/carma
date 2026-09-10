import { clamp } from "@carma-commons/math";
import type { SceneAccumulationFormat } from "@carma-mapping/engines/three/primitives/rendering";
import type { ShadowTerrainOptions } from "../contracts/shadow-simulation";

export const SHADOW_SCENE_USER_DATA = {
  OVERLAY: "isShadowSimulationOverlay",
} as const;

export const SHADOW_QUALITY = {
  FPS_120: 4,
  FPS_60: 16,
  FPS_30: 64,
  ULTRA: 256,
} as const;
export type ShadowQualityMultiplier =
  (typeof SHADOW_QUALITY)[keyof typeof SHADOW_QUALITY];
export type MeshErrorTargetPixels = 0.25 | 0.5 | 1 | 2 | 4;
export const SHADOW_MSAA_MAX = "max" as const;
export const DEFAULT_SHADOW_SUN_DISC_SAMPLES = 64;
export const SHADOW_MSAA_OPTIONS = [0, 2, 4, 8, SHADOW_MSAA_MAX] as const;
export type ShadowMsaaSamples = (typeof SHADOW_MSAA_OPTIONS)[number];

/** Budgets at 2560×1440 physical pixels, not a promised frame rate.
 * Canvas, map capture and label resolution never change with these profiles.
 */
export const SHADOW_QUALITY_PROFILES = {
  [SHADOW_QUALITY.FPS_120]: {
    targetFps: 120,
    depthSize: 2048,
    terrainErrorPixels: 2,
    shadowTexelErrorPixels: 2,
    terrainTileLimit: 96,
    terrainSegments: 128,
    meshErrorPixels: 4,
    sunSamples: DEFAULT_SHADOW_SUN_DISC_SAMPLES,
    msaaSamples: 0,
  },
  [SHADOW_QUALITY.FPS_60]: {
    targetFps: 60,
    depthSize: 3072,
    terrainErrorPixels: 1,
    shadowTexelErrorPixels: 1,
    terrainTileLimit: 144,
    terrainSegments: 256,
    meshErrorPixels: 1,
    sunSamples: DEFAULT_SHADOW_SUN_DISC_SAMPLES,
    msaaSamples: 2,
  },
  [SHADOW_QUALITY.FPS_30]: {
    targetFps: 30,
    depthSize: 4096,
    terrainErrorPixels: 0.5,
    shadowTexelErrorPixels: 0.5,
    terrainTileLimit: 192,
    terrainSegments: 512,
    meshErrorPixels: 1,
    sunSamples: DEFAULT_SHADOW_SUN_DISC_SAMPLES,
    msaaSamples: 4,
  },
  [SHADOW_QUALITY.ULTRA]: {
    targetFps: null,
    depthSize: 16384,
    terrainErrorPixels: 0.25,
    shadowTexelErrorPixels: 0.25,
    terrainTileLimit: 256,
    terrainSegments: 512,
    meshErrorPixels: 0.25,
    sunSamples: DEFAULT_SHADOW_SUN_DISC_SAMPLES,
    msaaSamples: SHADOW_MSAA_MAX,
  },
} as const;

export const resolveShadowTerrainQuality = (
  terrain: ShadowTerrainOptions | undefined,
  quality: ShadowQualityMultiplier,
  errorTargetPixels: MeshErrorTargetPixels = DEFAULT_TERRAIN_ERROR_TARGET_PIXELS
): ShadowTerrainOptions | undefined => {
  if (!terrain) return undefined;
  const profile = SHADOW_QUALITY_PROFILES[quality];
  return {
    ...terrain,
    errorTargetPixels,
    meshSegments: Math.min(terrain.tileSize, profile.terrainSegments),
    maxSelectionTiles: Math.min(
      terrain.maxSelectionTiles ?? profile.terrainTileLimit,
      profile.terrainTileLimit
    ),
  };
};

export const DEFAULT_SHADOW_QUALITY: ShadowQualityMultiplier = 64;
export const DEFAULT_MESH_ERROR_TARGET_PIXELS: MeshErrorTargetPixels = 2;
export const DEFAULT_TERRAIN_ERROR_TARGET_PIXELS: MeshErrorTargetPixels = 2;
/** Explicit mesh-only ceiling; browser memory-pressure admission still applies. */
export const DEFAULT_MESH_CACHE_BUDGET_BYTES = 24 * 1024 ** 3;
export const DEFAULT_SHADOW_SURFACE_COLOR = "#d3d3d3";
export const DEFAULT_SHADOW_BUILDING_COLOR_MIX = 0;
export const DEFAULT_SHADOW_BUILDING_TEXTURE_SATURATION = 1;
export const DEFAULT_SHADOW_BUILDING_COLOR = "#ffffff";

export const SHADOW_BUFFER_LAYOUT = {
  MONO: "mono",
  TILED: "tiled",
} as const;
export type ShadowBufferLayout =
  (typeof SHADOW_BUFFER_LAYOUT)[keyof typeof SHADOW_BUFFER_LAYOUT];

/** The scene compositor carries color, not just monochrome visibility. */
export const SHADOW_BUFFER_FORMAT = {
  HDR_16: "rgba16f",
  HDR_16_32: "rgba16f-32f",
  HDR_32: "rgba32f",
  SDR_8: "rgba8",
} as const satisfies Record<string, SceneAccumulationFormat>;

export type ShadowBufferFormat =
  (typeof SHADOW_BUFFER_FORMAT)[keyof typeof SHADOW_BUFFER_FORMAT];
export const SHADOW_SUN_DISC_SAMPLES = [
  32, 64, 128, 256, 512, 1024, 2048, 4096, 8192,
] as const;
export type ShadowSunDiscSamples = (typeof SHADOW_SUN_DISC_SAMPLES)[number];
export const DEFAULT_SHADOW_GROUND_TEXEL_FIT = true;

export type ShadowRenderQualityOptions = Readonly<{
  /** Adapt shadow work only; never the map capture or scene-color resolution. */
  shadowAdaptiveQuality?: boolean;
  shadowBufferLayout?: ShadowBufferLayout;
  shadowBufferFormat?: ShadowBufferFormat;
  shadowSunDiscSamples?: ShadowSunDiscSamples;
  shadowMsaaSamples?: ShadowMsaaSamples;
  shadowGroundTexelFit?: boolean;
}>;

export const resolveShadowRenderQuality = (
  options: ShadowRenderQualityOptions = {},
  quality: ShadowQualityMultiplier = DEFAULT_SHADOW_QUALITY
): Required<ShadowRenderQualityOptions> => ({
  shadowAdaptiveQuality: options.shadowAdaptiveQuality ?? true,
  shadowBufferLayout:
    options.shadowBufferLayout &&
    Object.values(SHADOW_BUFFER_LAYOUT).includes(options.shadowBufferLayout)
      ? options.shadowBufferLayout
      : // Decision: DIRECT-SUN-DEFAULT-20260910 in three/TILED_SHADOW_PAGES.md.
        // Full-tile captures can violate visible pixel demand at close range.
        SHADOW_BUFFER_LAYOUT.MONO,
  shadowBufferFormat:
    options.shadowBufferFormat &&
    Object.values(SHADOW_BUFFER_FORMAT).includes(options.shadowBufferFormat)
      ? options.shadowBufferFormat
      : SHADOW_BUFFER_FORMAT.HDR_16_32,
  shadowSunDiscSamples:
    options.shadowSunDiscSamples &&
    SHADOW_SUN_DISC_SAMPLES.includes(options.shadowSunDiscSamples)
      ? options.shadowSunDiscSamples
      : SHADOW_QUALITY_PROFILES[quality].sunSamples,
  shadowMsaaSamples:
    options.shadowBufferFormat === SHADOW_BUFFER_FORMAT.HDR_32
      ? 0
      : options.shadowMsaaSamples !== undefined &&
        SHADOW_MSAA_OPTIONS.includes(options.shadowMsaaSamples)
      ? options.shadowMsaaSamples
      : SHADOW_QUALITY_PROFILES[quality].msaaSamples,
  shadowGroundTexelFit:
    options.shadowGroundTexelFit ?? DEFAULT_SHADOW_GROUND_TEXEL_FIT,
});

export const resolveShadowQuality = (
  quality: number | undefined
): ShadowQualityMultiplier =>
  Object.values(SHADOW_QUALITY).includes(quality as ShadowQualityMultiplier)
    ? (quality as ShadowQualityMultiplier)
    : DEFAULT_SHADOW_QUALITY;

export const resolveShadowSurfaceColor = (value: unknown): string => {
  if (typeof value === "string" && /^#[\da-f]{6}$/i.test(value)) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return `#${clamp(Math.round(value), 0, 0xffffff)
      .toString(16)
      .padStart(6, "0")}`;
  }
  return DEFAULT_SHADOW_SURFACE_COLOR;
};
