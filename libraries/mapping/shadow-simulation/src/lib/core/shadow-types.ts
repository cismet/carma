import { clamp } from "@carma-commons/math";

export type ShadowQualityMultiplier = 4 | 16 | 64;
export type MeshErrorTargetPixels = 0.25 | 1 | 4;

export const DEFAULT_SHADOW_QUALITY: ShadowQualityMultiplier = 64;
export const DEFAULT_MESH_ERROR_TARGET_PIXELS: MeshErrorTargetPixels = 4;
export const DEFAULT_SHADOW_SURFACE_COLOR = "#d3d3d3";
export const DEFAULT_SHADOW_BUILDING_COLOR_MIX = 0.05;
export const DEFAULT_SHADOW_BUILDING_TEXTURE_SATURATION = 1;
export const DEFAULT_SHADOW_BUILDING_COLOR = "#ffffff";

export const resolveShadowQuality = (
  quality: number | undefined
): ShadowQualityMultiplier =>
  quality === 4 || quality === 16 || quality === 64
    ? quality
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
