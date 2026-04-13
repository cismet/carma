import type { CSSProperties } from "react";

export const FROSTED_GLASS_BLUR_PRESET = {
  CLOSE: "close",
  MID: "mid",
  FAR: "far",
} as const;

export type FrostedGlassBlurPreset =
  (typeof FROSTED_GLASS_BLUR_PRESET)[keyof typeof FROSTED_GLASS_BLUR_PRESET];
export type FrostedGlassShadowPreset = FrostedGlassBlurPreset;

export const FROSTED_GLASS_BLUR_PX_BY_PRESET: Record<
  FrostedGlassBlurPreset,
  number
> = {
  close: 4,
  mid: 8,
  far: 12,
};

export const FROSTED_GLASS_SHADOW_BY_PRESET: Record<
  FrostedGlassShadowPreset,
  string
> = {
  close: "0 2px 6px rgba(15, 23, 42, 0.1)",
  mid: "0 6px 16px rgba(15, 23, 42, 0.14)",
  far: "0 10px 24px rgba(15, 23, 42, 0.16)",
};

export const DEFAULT_FROSTED_GLASS_BLUR_PRESET = FROSTED_GLASS_BLUR_PRESET.MID;

export const DEFAULT_FROSTED_GLASS_BLUR_PX =
  FROSTED_GLASS_BLUR_PX_BY_PRESET[DEFAULT_FROSTED_GLASS_BLUR_PRESET];

export const readFrostedGlassBlurPx = (
  blur: FrostedGlassBlurPreset | number = DEFAULT_FROSTED_GLASS_BLUR_PRESET
): number =>
  typeof blur === "number" ? blur : FROSTED_GLASS_BLUR_PX_BY_PRESET[blur];

export const readFrostedGlassBackdropStyle = (
  blur: FrostedGlassBlurPreset | number = DEFAULT_FROSTED_GLASS_BLUR_PRESET
): CSSProperties => ({
  backdropFilter: `blur(${readFrostedGlassBlurPx(blur)}px)`,
  WebkitBackdropFilter: `blur(${readFrostedGlassBlurPx(blur)}px)`,
});

export const readFrostedGlassShadow = (
  shadow: FrostedGlassShadowPreset = DEFAULT_FROSTED_GLASS_BLUR_PRESET
): string => FROSTED_GLASS_SHADOW_BY_PRESET[shadow];

export const readFrostedGlassShadowStyle = (
  shadow: FrostedGlassShadowPreset = DEFAULT_FROSTED_GLASS_BLUR_PRESET
): CSSProperties => ({
  boxShadow: readFrostedGlassShadow(shadow),
});
