import type { CssPixels, DevicePixels, Meters } from "@carma-units";

/** Render order, occlusion and halo of the scene lines. */
export const MAPLIBRE_SCENE_LINE_DEFAULTS = Object.freeze({
  renderOrder: 1_000,
  occludedRenderOrder: 1_001,
  /** Overlay lines (no depth test) draw after the depth-tested lines, below the markers. */
  overlayRenderOrder: 1_002,
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

/** Render order, grid and offsets of the rings, discs, cones, markers and fills. */
export const MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS = Object.freeze({
  ringRenderOrder: 10_000,
  /** Discs draw over rings they overlap (a handle on a disc rim). */
  discRenderOrder: 10_001,
  fillRenderOrder: 900,
  occludedFillRenderOrder: 901,
  /** Occludable rings and discs draw with the fills, below the scene lines. */
  occludableRingRenderOrder: 902,
  occludableDiscRenderOrder: 903,
  /** Cones draw over the scene lines, their occluded outline last. */
  coneRenderOrder: 10_002,
  occludedConeRenderOrder: 10_003,
  coneSegments: 24,
  /** Markers draw over the scene lines and their rulers, below the gizmo. */
  markerRenderOrder: 2_000,
  occludedMarkerRenderOrder: 2_001,
  /**
   * A marker is depth-tested this many of its radii nearer the camera than
   * its node, so the surface the node sits on does not cut into the disc
   * (a surface up to about 63 degrees off the view plane).
   */
  markerDepthLiftRadii: 2,
  /** The dotted ring of an occluded marker, like an occluded DOM label. */
  markerOccludedOpacity: 0.75,
  /** Shortest dot pitch of that ring in CSS pixels; it widens with the outline. */
  markerDotPitchPx: 3,
  /** Pattern tiles are drawn at this size and stretched to the grid pitch. */
  fillGridTextureSize: 64,
  /** The geometry's uv unit in metres; the texture repeat maps it to the pitch. */
  fillGridUvUnitMeters: 1,
  ringSegments: 64,
  /** Fills sit on the surface they measure; pull them a hair toward the camera. */
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});
