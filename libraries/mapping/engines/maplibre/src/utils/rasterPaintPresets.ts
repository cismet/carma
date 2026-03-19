import type { RasterPaintOverrides } from "../components/LibreMap";

/**
 * Named raster paint presets for MapLibre raster layers.
 *
 * These approximate the CSS-filter-based named styles used with Leaflet
 * (e.g. `filter:grayscale(0.9)brightness(0.9)invert(1)`) using MapLibre's
 * native raster paint properties.
 *
 * Note: MapLibre has no `raster-invert` property, so the "night" preset
 * cannot perfectly replicate the CSS invert effect. Instead it uses heavy
 * desaturation, low brightness, boosted contrast, and a blue hue shift to
 * create a usable dark-map feel.
 */
export const RASTER_PAINT_PRESETS = {
  /**
   * Night mode: dark, desaturated, blue-tinted map.
   *
   * CSS equivalent was: grayscale(0.9) brightness(0.9) invert(1)
   * Without invert we approximate a dark look via low brightness + contrast.
   */
  night: {
    "raster-saturation": -0.9,
    "raster-brightness-max": 0.2,
    "raster-brightness-min": 0,
    "raster-contrast": 0.4,
    "raster-hue-rotate": 200,
  },

  /**
   * Blue / muted cold tone.
   *
   * CSS equivalent was: sepia(0.5) hue-rotate(155deg) contrast(0.9) opacity(0.9)
   */
  blue: {
    "raster-saturation": -0.3,
    "raster-brightness-max": 0.85,
    "raster-brightness-min": 0,
    "raster-contrast": -0.1,
    "raster-hue-rotate": 155,
  },
} as const satisfies Record<string, RasterPaintOverrides>;
