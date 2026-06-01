// Source: CSSWG Compositing and Blending Module Level 2, Editor's Draft
// 13 December 2025, <blend-mode> grammar for mix-blend-mode.
// https://drafts.csswg.org/compositing/#mix-blend-mode
export const CSS_MIX_BLEND_MODE = {
  NORMAL: "normal",
  DARKEN: "darken",
  MULTIPLY: "multiply",
  COLOR_BURN: "color-burn",
  LIGHTEN: "lighten",
  SCREEN: "screen",
  COLOR_DODGE: "color-dodge",
  OVERLAY: "overlay",
  SOFT_LIGHT: "soft-light",
  HARD_LIGHT: "hard-light",
  DIFFERENCE: "difference",
  EXCLUSION: "exclusion",
  HUE: "hue",
  SATURATION: "saturation",
  COLOR: "color",
  LUMINOSITY: "luminosity",
  PLUS_LIGHTER: "plus-lighter",
} as const;

export type CssMixBlendMode =
  (typeof CSS_MIX_BLEND_MODE)[keyof typeof CSS_MIX_BLEND_MODE];

export const CSS_MIX_BLEND_MODES = Object.freeze(
  Object.values(CSS_MIX_BLEND_MODE)
) as readonly CssMixBlendMode[];
