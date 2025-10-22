import type { UnitRgbaArray } from "@carma/types";

/**
 * Common colors as unit RGBA arrays (0-1 range)
 * Values copied from Cesium.Color definitions
 */

// for use with Cesium Globe baseColor property to keep it pickable
const MIN_8BIT_ALPHA = 1 / 255;

const hexToUnit = (hex: string): UnitRgbaArray => {
  let normalized = hex.startsWith("#") ? hex.slice(1) : hex;

  // Expand shorthand (#ccc -> #cccccc)
  if (normalized.length === 3) {
    normalized = normalized
      .split("")
      .map((c) => c + c)
      .join("");
  }

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const a =
    normalized.length === 8 ? parseInt(normalized.slice(6, 8), 16) : 255;

  return [r / 255, g / 255, b / 255, a / 255] as UnitRgbaArray;
};

// Hex color definitions
export const COLORS_HEX = {
  LIGHTGRAY: "#d3d3d3",
  GRAY: "#808080",
  DARKGRAY: "#a9a9a9",
  LEAFLET_BLUE: "#3388ff",
  WUPP_BLUE: "#0078a8",
  WUPP_BLUE_DARK: "#123c6a",
} as const;

export const COLORS = {
  WHITE: [1, 1, 1, 1] as UnitRgbaArray,
  BLACK: [0, 0, 0, 1] as UnitRgbaArray,
  LIGHTGRAY: hexToUnit(COLORS_HEX.LIGHTGRAY),
  GRAY: hexToUnit(COLORS_HEX.GRAY),
  DARKGRAY: hexToUnit(COLORS_HEX.DARKGRAY),
  RED: [1, 0, 0, 1] as UnitRgbaArray,
  GREEN: [0, 1, 0, 1] as UnitRgbaArray,
  BLUE: [0, 0, 1, 1] as UnitRgbaArray,
  YELLOW: [1, 1, 0, 1] as UnitRgbaArray,
  CYAN: [0, 1, 1, 1] as UnitRgbaArray,
  MAGENTA: [1, 0, 1, 1] as UnitRgbaArray,
  LEAFLET_BLUE: hexToUnit(COLORS_HEX.LEAFLET_BLUE),
  WUPP_BLUE: hexToUnit(COLORS_HEX.WUPP_BLUE),
  WUPP_BLUE_DARK: hexToUnit(COLORS_HEX.WUPP_BLUE_DARK),
  // only really useful for testing to see if alpha is enabled
  NONZERO_TRANSPARENT_RED: [1, 0, 0, MIN_8BIT_ALPHA] as UnitRgbaArray,
  NONZERO_TRANSPARENT_BLACK: [0, 0, 0, MIN_8BIT_ALPHA] as UnitRgbaArray,
  NONZERO_TRANSPARENT_WHITE: [1, 1, 1, MIN_8BIT_ALPHA] as UnitRgbaArray,
  TRANSPARENT: [0, 0, 0, 0] as UnitRgbaArray,
} as const;
