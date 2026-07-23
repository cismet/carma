import * as THREE from "three";

// ─────────────────────────────────────────────────────────────
//  Color ramps for scalar-field colorization (Potree-style).
//  Each ramp is a list of stops interpolated into a 256×1
//  DataTexture for the point shader.
// ─────────────────────────────────────────────────────────────

export type RampName =
  | "viridis"
  | "inferno"
  | "turbo"
  | "spectral"
  | "elevation"
  | "grayscale"
  | "classification";

const RAMP_STOPS: Record<RampName, string[]> = {
  viridis: ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#fde725"],
  inferno: ["#000004", "#420a68", "#932667", "#dd513a", "#fca50a", "#fcffa4"],
  turbo: [
    "#30123b",
    "#4569ee",
    "#26bce1",
    "#32f298",
    "#a4fc3c",
    "#f1ca3a",
    "#f36315",
    "#c92903",
    "#7a0403",
  ],
  spectral: [
    "#5e4fa2",
    "#3288bd",
    "#66c2a5",
    "#e6f598",
    "#fee08b",
    "#f46d43",
    "#9e0142",
  ],
  elevation: ["#1a9850", "#a6d96a", "#ffffbf", "#fdae61", "#d73027", "#ffffff"],
  grayscale: ["#000000", "#ffffff"],
  // AWG-oriented city-map palette. Numeric class IDs remain authoritative;
  // hue and lightness deliberately separate adjacent semantic classes.
  classification: [
    "#9aa7b4", // 0 never classified
    "#4f86c6", // 1 unclassified
    "#858b91", // 2 ground / paved surface
    "#b6df45", // 3 low vegetation
    "#45bd62", // 4 medium vegetation
    "#087a3e", // 5 high vegetation
    "#e89b45", // 6 buildings
    "#9b4dcc", // 7 low noise
    "#28a9c7", // 8 reserved / dataset-specific
    "#00a875", // 9 AWG vegetation content
    "#80522f", // 10 rail
    "#46515e", // 11 road / asphalt
    "#25b9de", // 12 overlap
    "#f2cf32", // 13 wire guard
    "#ff8a28", // 14 conductor
    "#c23b32", // 15 transmission tower
    "#ffe169", // 16 wire connector
    "#b96f3d", // 17 bridge deck
    "#e43f76", // 18 high noise
  ],
};

export const RAMP_NAMES = Object.keys(RAMP_STOPS) as RampName[];
export const QUALITATIVE_RAMP_NAMES = [
  "classification",
] as const satisfies readonly RampName[];

export const isQualitativeRamp = (name: RampName): boolean =>
  QUALITATIVE_RAMP_NAMES.includes(
    name as (typeof QUALITATIVE_RAMP_NAMES)[number]
  );

export interface CategoryStyle {
  color: string;
  opacity: number;
  visible: boolean;
  /** User-defined display label; never used to interpret the category value. */
  label?: string;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

/** 256-entry RGBA byte gradient for a ramp (also used for CSS previews) */
export const buildRampBytes = (
  name: RampName,
  inverted = false
): Uint8Array => {
  const stops = RAMP_STOPS[name].map(hexToRgb);
  const data = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    if (isQualitativeRamp(name)) {
      const rawIndex = Math.min(
        stops.length - 1,
        Math.floor((i / 256) * stops.length)
      );
      const color = stops[inverted ? stops.length - 1 - rawIndex : rawIndex];
      data[i * 4] = color[0];
      data[i * 4 + 1] = color[1];
      data[i * 4 + 2] = color[2];
      data[i * 4 + 3] = 255;
      continue;
    }
    const unit = inverted ? 1 - i / 255 : i / 255;
    const t = unit * (stops.length - 1);
    const index = Math.min(Math.floor(t), stops.length - 2);
    const fraction = t - index;
    const from = stops[index];
    const to = stops[index + 1];
    data[i * 4] = Math.round(from[0] + (to[0] - from[0]) * fraction);
    data[i * 4 + 1] = Math.round(from[1] + (to[1] - from[1]) * fraction);
    data[i * 4 + 2] = Math.round(from[2] + (to[2] - from[2]) * fraction);
    data[i * 4 + 3] = 255;
  }
  return data;
};

const textureCache = new Map<string, THREE.DataTexture>();

export const getRampTexture = (
  name: RampName,
  inverted = false
): THREE.DataTexture => {
  const key = `${name}:${inverted ? "inverted" : "normal"}`;
  let texture = textureCache.get(key);
  if (!texture) {
    texture = new THREE.DataTexture(buildRampBytes(name, inverted), 256, 1);
    texture.needsUpdate = true;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    textureCache.set(key, texture);
  }
  return texture;
};

/** CSS linear-gradient string for ramp previews in UI */
export const rampCssGradient = (name: RampName, inverted = false): string => {
  const stops = inverted ? [...RAMP_STOPS[name]].reverse() : RAMP_STOPS[name];
  return `linear-gradient(to right, ${stops.join(", ")})`;
};

export const categoryColor = (
  ramp: RampName,
  value: number,
  inverted = false
): string => {
  const colors = RAMP_STOPS[isQualitativeRamp(ramp) ? ramp : "classification"];
  const index = Math.abs(Math.trunc(value)) % colors.length;
  return colors[inverted ? colors.length - 1 - index : index];
};

/** RGBA lookup table for integer category values 0…255. */
export const buildCategoryLut = (
  ramp: RampName,
  inverted: boolean,
  styles: Record<string, CategoryStyle>
): Uint8Array => {
  const data = new Uint8Array(256 * 4);
  for (let value = 0; value < 256; value++) {
    const style = styles[String(value)];
    const [red, green, blue] = hexToRgb(
      style?.color ?? categoryColor(ramp, value, inverted)
    );
    data[value * 4] = red;
    data[value * 4 + 1] = green;
    data[value * 4 + 2] = blue;
    data[value * 4 + 3] = Math.round(
      255 *
        (style?.visible === false
          ? 0
          : Math.max(0, Math.min(1, style?.opacity ?? 1)))
    );
  }
  return data;
};
