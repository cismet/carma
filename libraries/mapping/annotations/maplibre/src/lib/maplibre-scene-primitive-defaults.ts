export const MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS = Object.freeze({
  ringRenderOrder: 10_000,
  fillRenderOrder: 900,
  occludedFillRenderOrder: 901,
  /** Pattern tiles are drawn at this size and stretched to the grid pitch. */
  fillGridTextureSize: 64,
  /** The geometry's uv unit in metres; the texture repeat maps it to the pitch. */
  fillGridUvUnitMeters: 1,
  ringSegments: 64,
  /** Fills sit on the surface they measure; pull them a hair toward the camera. */
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});
