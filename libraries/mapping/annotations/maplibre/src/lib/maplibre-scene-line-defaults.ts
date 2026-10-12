import type { CssPixels, DevicePixels, Meters } from "@carma-units";

export const MAPLIBRE_SCENE_LINE_DEFAULTS = Object.freeze({
  renderOrder: 1_000,
  occludedRenderOrder: 1_001,
  occludedOpacity: 0.45,
  occludedDashPx: 6 as CssPixels,
  occludedGapPx: 4 as CssPixels,
  /** Pulls the visible pass a hair toward the camera so surface-hugging lines do not z-fight. */
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
  /** Ruler dots move this far toward the camera; points cannot use the polygon offset. */
  rulerDotLiftMeters: 0.2 as Meters,
  /** Extra quad width the line sides fade out over. */
  edgeFeatherPx: 1 as DevicePixels,
  /**
   * A darkening halo under each visible line: it reaches this far beside the
   * line and pulls bright surfaces down to `haloDarkness` grey at the line,
   * fading out toward its rim. Per channel minimum, so darker stays as it is.
   */
  haloWidthPx: 10 as CssPixels,
  haloDarkness: 0.8,
  haloRenderOrder: 999,
});
