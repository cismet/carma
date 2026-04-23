/**
 * Common colors as unit RGBA arrays (0-1 range)
 * Values copied from Cesium.Color definitions
 */

export type Rgb255 = readonly [red: number, green: number, blue: number];

export type DisplayP3 = readonly [red: number, green: number, blue: number];

export type UnitRgba = [
  red: number,
  green: number,
  blue: number,
  alpha: number
];

const normalizeHexColor = (
  hex: string,
  { allowAlpha = false }: { allowAlpha?: boolean } = {}
): string => {
  let normalized = hex.startsWith("#") ? hex.slice(1) : hex;

  if (normalized.length === 3 || (allowAlpha && normalized.length === 4)) {
    normalized = normalized
      .split("")
      .map((channel) => channel + channel)
      .join("");
  }

  const isValidLength = allowAlpha
    ? normalized.length === 6 || normalized.length === 8
    : normalized.length === 6;

  if (!isValidLength || !/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error(`Invalid hex color "${hex}"`);
  }

  return normalized;
};

export const hexToRgb255 = (hex: string): Rgb255 => {
  const normalized = normalizeHexColor(hex, { allowAlpha: true });

  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ] as const satisfies Rgb255;
};

export const formatRgb255Css = ([red, green, blue]: Rgb255): string =>
  `rgb(${red}, ${green}, ${blue})`;

export const formatRgba255Css = (
  [red, green, blue]: Rgb255,
  alpha: number
): string => `rgba(${red}, ${green}, ${blue}, ${alpha})`;

export const formatHexRgbCss = (hex: string): string =>
  formatRgb255Css(hexToRgb255(hex));

export const formatHexRgbaCss = (hex: string, alpha: number): string =>
  formatRgba255Css(hexToRgb255(hex), alpha);

export const formatDisplayP3Css = (
  [red, green, blue]: DisplayP3,
  alpha: number = 1
): string =>
  alpha >= 1
    ? `color(display-p3 ${red} ${green} ${blue})`
    : `color(display-p3 ${red} ${green} ${blue} / ${alpha})`;

export const supportsDisplayP3CssColor = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(color-gamut: p3)").matches &&
  typeof CSS !== "undefined" &&
  typeof CSS.supports === "function" &&
  CSS.supports("color", "color(display-p3 1 1 1)");

export const DISPLAY_P3_COLORS = {
  WHITE_MAX: [1, 1, 1] as const satisfies DisplayP3,
} as const;

export const resolveDisplayP3CssColor = ({
  srgbFallback,
  displayP3,
}: {
  srgbFallback: string;
  displayP3: string;
}): string => (supportsDisplayP3CssColor() ? displayP3 : srgbFallback);

// In standard SDR page rendering, the brightest usable white is still channel-max
// D65 white. This helper upgrades the encoding to Display P3 when available; it
// does not request HDR luminance on its own.
export const resolveDisplayP3WhiteCssColor = (alpha: number = 1): string =>
  resolveDisplayP3CssColor({
    srgbFallback: formatHexRgbaCss(COLORS_HEX.NEUTRAL_WHITE, alpha),
    displayP3: formatDisplayP3Css(DISPLAY_P3_COLORS.WHITE_MAX, alpha),
  });

// for use with Cesium Globe baseColor property to keep it pickable
export const UNIT_ALPHA = {
  TRANSPARENT: 0,
  MIN_8BIT: 1 / 255,
  OPAQUE: 1,
};

const hexToUnit = (hex: string): UnitRgba => {
  const normalized = normalizeHexColor(hex, { allowAlpha: true });

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const a =
    normalized.length === 8 ? parseInt(normalized.slice(6, 8), 16) : 255;

  return [r / 255, g / 255, b / 255, a / 255] as UnitRgba;
};

// Hex color definitions
export const COLORS_HEX = {
  LIGHTGRAY: "#d3d3d3",
  GRAY: "#808080",
  DARKGRAY: "#a9a9a9",
  AXIS_EAST: "#dc2626",
  AXIS_NORTH: "#16a34a",
  AXIS_UP: "#2563eb",
  NEUTRAL_WHITE: "#ffffff",
  NEUTRAL_BLACK: "#000000",
  NEUTRAL_SURFACE_SUBTLE: "#f5f5f5",
  NEUTRAL_BORDER_SUBTLE: "#e3e3e3",
  NEUTRAL_TEXT_PRIMARY: "#212529",
  NEUTRAL_TEXT_MUTED: "#6b7280",
  NEUTRAL_TEXT_STRONG: "#111827",
  NEUTRAL_BORDER_DEFAULT: "#d1d5db",
  NEUTRAL_BORDER_INPUT: "#ced4da",
  STATE_FOCUS_BACKGROUND_WARM: "#fef3c7",
  STATE_FOCUS_OUTLINE: "#1677ff",
  ACCENT_MEASUREMENTS: "#3b82f6",
  ACCENT_NEUTRALS: "#888987",
  ACCENT_NEUTRALS_HOVER: "#a0a0a0",
  LEAFLET_BLUE: "#3388ff",
  WUPP_BLUE: "#0078a8",
  WUPP_BLUE_DARK: "#123c6a",
} as const;

export const COLORS = {
  WHITE: [1, 1, 1, 1] as UnitRgba,
  BLACK: [0, 0, 0, 1] as UnitRgba,
  LIGHTGRAY: hexToUnit(COLORS_HEX.LIGHTGRAY),
  GRAY: hexToUnit(COLORS_HEX.GRAY),
  DARKGRAY: hexToUnit(COLORS_HEX.DARKGRAY),
  AXIS_EAST: hexToUnit(COLORS_HEX.AXIS_EAST),
  AXIS_NORTH: hexToUnit(COLORS_HEX.AXIS_NORTH),
  AXIS_UP: hexToUnit(COLORS_HEX.AXIS_UP),
  NEUTRAL_WHITE: hexToUnit(COLORS_HEX.NEUTRAL_WHITE),
  NEUTRAL_BLACK: hexToUnit(COLORS_HEX.NEUTRAL_BLACK),
  NEUTRAL_SURFACE_SUBTLE: hexToUnit(COLORS_HEX.NEUTRAL_SURFACE_SUBTLE),
  NEUTRAL_BORDER_SUBTLE: hexToUnit(COLORS_HEX.NEUTRAL_BORDER_SUBTLE),
  NEUTRAL_TEXT_PRIMARY: hexToUnit(COLORS_HEX.NEUTRAL_TEXT_PRIMARY),
  NEUTRAL_TEXT_MUTED: hexToUnit(COLORS_HEX.NEUTRAL_TEXT_MUTED),
  NEUTRAL_TEXT_STRONG: hexToUnit(COLORS_HEX.NEUTRAL_TEXT_STRONG),
  NEUTRAL_BORDER_DEFAULT: hexToUnit(COLORS_HEX.NEUTRAL_BORDER_DEFAULT),
  NEUTRAL_BORDER_INPUT: hexToUnit(COLORS_HEX.NEUTRAL_BORDER_INPUT),
  STATE_FOCUS_BACKGROUND_WARM: hexToUnit(
    COLORS_HEX.STATE_FOCUS_BACKGROUND_WARM
  ),
  STATE_FOCUS_OUTLINE: hexToUnit(COLORS_HEX.STATE_FOCUS_OUTLINE),
  ACCENT_MEASUREMENTS: hexToUnit(COLORS_HEX.ACCENT_MEASUREMENTS),
  ACCENT_NEUTRALS: hexToUnit(COLORS_HEX.ACCENT_NEUTRALS),
  ACCENT_NEUTRALS_HOVER: hexToUnit(COLORS_HEX.ACCENT_NEUTRALS_HOVER),
  RED: [1, 0, 0, 1] as UnitRgba,
  GREEN: [0, 1, 0, 1] as UnitRgba,
  BLUE: [0, 0, 1, 1] as UnitRgba,
  YELLOW: [1, 1, 0, 1] as UnitRgba,
  CYAN: [0, 1, 1, 1] as UnitRgba,
  MAGENTA: [1, 0, 1, 1] as UnitRgba,
  LEAFLET_BLUE: hexToUnit(COLORS_HEX.LEAFLET_BLUE),
  WUPP_BLUE: hexToUnit(COLORS_HEX.WUPP_BLUE),
  WUPP_BLUE_DARK: hexToUnit(COLORS_HEX.WUPP_BLUE_DARK),
  // only really useful for testing to see if alpha is enabled
  NONZERO_TRANSPARENT_RED: [1, 0, 0, UNIT_ALPHA.MIN_8BIT] as UnitRgba,
  NONZERO_TRANSPARENT_BLACK: [0, 0, 0, UNIT_ALPHA.MIN_8BIT] as UnitRgba,
  NONZERO_TRANSPARENT_WHITE: [1, 1, 1, UNIT_ALPHA.MIN_8BIT] as UnitRgba,
  TRANSPARENT: [0, 0, 0, 0] as UnitRgba,
} as const;
