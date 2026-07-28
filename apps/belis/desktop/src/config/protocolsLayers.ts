import type { LayerSpecification } from "maplibre-gl";
import slugify from "slugify";
import { statusFallbackRgba, statusRgba } from "./statusColors";
import { BELIS_ICON_SCALE } from "./mapLayerConfigs";

/**
 * AP feature layer definitions for Arbeitsaufträge mode.
 * Colors reflect protokoll status; white stroke for visibility on any background.
 * Selected features (via feature-state) get enlarged with a blue stroke.
 * source/source-layer are placeholders, overridden at runtime.
 */

/**
 * Belis sprite namespace.
 *
 * The main BELIS style (styleY.json) is loaded via CARMA's StyleComposer, which
 * calls `map.addSprite(spriteId, spriteUrl)` — that makes sprite images
 * addressable as `"<spriteId>:<name>"`, NOT as the bare name. The id is the
 * slugified sprite URL (see libraries/mapping/engines/maplibre/src/utils/
 * styleComposer.ts — `slugify(styleJson.sprite, ...)`).
 *
 * We reproduce the same call with the same options here so our hand-written
 * symbol layers can reference the belis sprite under its namespaced id.
 */
const BELIS_SPRITE_URL = "https://tiles.cismet.de/belis/sprites";
const BELIS_SPRITE_ID = slugify(BELIS_SPRITE_URL, {
  remove: /[^a-zA-Z0-9]/g,
  lower: true,
});
const sprite = (name: string) => `${BELIS_SPRITE_ID}:${name}`;

// Status palette driven centrally from ./statusColors. Alpha is lifted from
// the sidebar's 0.35 so the underlays read stronger on the map than they do
// in the white-backed AA list.
const STATUS_COLOR_ALPHA = 0.7;
const statusColor = [
  "match",
  ["get", "status"],
  "offen",
  statusRgba("offen", STATUS_COLOR_ALPHA),
  "in_bearbeitung",
  statusRgba("in_bearbeitung", STATUS_COLOR_ALPHA),
  "erledigt",
  statusRgba("erledigt", STATUS_COLOR_ALPHA),
  "fehlmeldung",
  statusRgba("fehlmeldung", STATUS_COLOR_ALPHA),
  statusFallbackRgba(STATUS_COLOR_ALPHA),
] as unknown as string;

// Selection no longer changes point geometry: a dedicated Icon_Full underlay
// layer (see the *-selection entries below) visualizes the selection instead.
//
// Match the circle diameter to the on-screen icon width at every zoom so the
// underlay sits directly behind the sprite without a visible ring outside of
// it. The sprite tiles are 66×66 but each icon's visible graphic occupies a
// different fraction of that bounding box per type (leuchten's lamp is small,
// schaltstelle's box is large, etc.), so we tune the half-width per type.
const SPRITE_HALF_PX_BY_TYPE = {
  leuchten: 14,
  mast: 14,
  abzweigdosen: 14,
  mauerlaschen: 22,
  schaltstelle: 28,
} as const;
type PointType = keyof typeof SPRITE_HALF_PX_BY_TYPE;

// Global halo added to every SPRITE_HALF_PX value at render time, so the
// green status circle extends a tiny bit beyond the visible icon. Expressed
// in 66-px sprite units (scales with zoom via iconSize). Tweak here only —
// do NOT inflate the per-type SPRITE_HALF_PX_BY_TYPE values, those represent
// the actual icon footprint and should stay ground truth.
const UNDERLAY_HALO_PX = 2;

const buildCircleRadius = (halfPx: number) => {
  const h = halfPx + UNDERLAY_HALO_PX;
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    10,
    h * 0.05 * BELIS_ICON_SCALE,
    16,
    h * 0.3 * BELIS_ICON_SCALE,
    23,
    h * 0.6 * BELIS_ICON_SCALE,
  ] as unknown as number;
};

// Real leitungen line. Thinned another step toward styleY's "leitungen-base".
//   styleY:  z10 → 0.5   z16 → 2    z22 → 6
//   ours:    z10 → 1     z16 → 3    z22 → 7
const lineWidth = [
  "interpolate",
  ["linear"],
  ["zoom"],
  10,
  1,
  16,
  3,
  22,
  7,
] as unknown as number;

// Green status underlay — ~3px halo each side of the real line at every zoom.
const underlayLineWidth = [
  "interpolate",
  ["linear"],
  ["zoom"],
  10,
  4,
  16,
  9,
  22,
  13,
] as unknown as number;

// Real leitungen coloring copied from styleY.json's "leitungen-base" layer:
// selected → solid blue, otherwise match on the `bezeichnung` property.
const bezeichnungColor = [
  "case",
  ["boolean", ["feature-state", "selected"], false],
  "#4892F0",
  [
    "match",
    ["get", "bezeichnung"],
    ["Freileitung", "Tragseil mit Freileitung"],
    "#C04040",
    "Tragseil",
    "#333333",
    "Leerrohr",
    "#555555",
    "Hinweis",
    "#5B9A8B",
    "#D3976C",
  ],
] as unknown as string;

// Opacity expression for the Icon_Full selection underlay — mirrors styleY's
// *-selection layers: shown only when the feature is selected.
const selectionIconOpacity = [
  "case",
  ["boolean", ["feature-state", "selected"], false],
  0.7,
  0,
] as unknown as number;

const buildCirclePaint = (type: PointType) => ({
  "circle-radius": buildCircleRadius(SPRITE_HALF_PX_BY_TYPE[type]),
  "circle-color": statusColor,
});

/**
 * Zoom-based icon sizing, copied from the main Fachobjekte styleY.json
 * (leuchten-icon layer), then multiplied by BELIS_ICON_SCALE so protocol icons
 * render at the same on-screen size as Fachobjekte icons: styleY's layers go
 * through the StyleComposer, which scales them by
 * `BELIS_MARKER_SYMBOL_SIZE / 35` (= BELIS_ICON_SCALE), while these
 * hand-written layers bypass the composer.
 */
const iconSize = [
  "interpolate",
  ["linear"],
  ["zoom"],
  10,
  0.05 * BELIS_ICON_SCALE,
  16,
  0.3 * BELIS_ICON_SCALE,
  23,
  0.6 * BELIS_ICON_SCALE,
] as unknown as number;

export const protocolsLayers: LayerSpecification[] = [
  // Selection halos — one per point type, rendering Icon_Full only when the
  // feature is selected. Placed FIRST in the array so they are drawn
  // UNDERNEATH every other protocol layer (including the green status
  // circles), peeking out as a ring around the underlay when a feature is
  // selected.
  {
    id: "leuchten-selection",
    type: "symbol",
    source: "belis-source",
    "source-layer": "leuchten",
    layout: {
      "icon-image": sprite("Icon_Full"),
      "icon-anchor": "center",
      "icon-size": iconSize,
      "icon-allow-overlap": true,
    },
    paint: {
      "icon-opacity": selectionIconOpacity,
    },
  },
  {
    id: "mast-selection",
    type: "symbol",
    source: "belis-source",
    "source-layer": "mast",
    layout: {
      "icon-image": sprite("Icon_Full"),
      "icon-anchor": "center",
      "icon-size": iconSize,
      "icon-allow-overlap": true,
    },
    paint: {
      "icon-opacity": selectionIconOpacity,
    },
  },
  {
    id: "abzweigdosen-selection",
    type: "symbol",
    source: "belis-source",
    "source-layer": "abzweigdosen",
    layout: {
      "icon-image": sprite("Icon_Full"),
      "icon-anchor": "center",
      "icon-size": iconSize,
      "icon-allow-overlap": true,
    },
    paint: {
      "icon-opacity": selectionIconOpacity,
    },
  },
  {
    id: "mauerlaschen-selection",
    type: "symbol",
    source: "belis-source",
    "source-layer": "mauerlaschen",
    layout: {
      "icon-image": sprite("Icon_Full"),
      "icon-anchor": "center",
      "icon-size": iconSize,
      "icon-allow-overlap": true,
    },
    paint: {
      "icon-opacity": selectionIconOpacity,
    },
  },
  {
    id: "schaltstelle-selection",
    type: "symbol",
    source: "belis-source",
    "source-layer": "schaltstelle",
    layout: {
      "icon-image": sprite("Icon_Full"),
      "icon-anchor": "center",
      "icon-size": iconSize,
      "icon-allow-overlap": true,
    },
    paint: {
      "icon-opacity": selectionIconOpacity,
    },
  },
  // Green status underlay — widened so it shows as a halo next to the
  // real-colored line drawn on top (see "leitungen-real" below).
  {
    id: "leitungen",
    type: "line",
    source: "belis-source",
    "source-layer": "leitungen",
    paint: {
      "line-color": statusColor,
      "line-width": underlayLineWidth,
    },
  },
  // Real leitungen color on top, using the same bezeichnung-based match as the
  // main Fachobjekte style. Narrower than the underlay so the green shows on
  // both sides.
  {
    id: "leitungen-real",
    type: "line",
    source: "belis-source",
    "source-layer": "leitungen",
    paint: {
      "line-color": bezeichnungColor,
      "line-width": lineWidth,
    },
  },
  {
    id: "leuchten",
    type: "circle",
    source: "belis-source",
    "source-layer": "leuchten",
    paint: buildCirclePaint("leuchten"),
  },
  {
    id: "mast",
    type: "circle",
    source: "belis-source",
    "source-layer": "mast",
    paint: buildCirclePaint("mast"),
  },
  {
    id: "abzweigdosen",
    type: "circle",
    source: "belis-source",
    "source-layer": "abzweigdosen",
    paint: buildCirclePaint("abzweigdosen"),
  },
  {
    id: "mauerlaschen",
    type: "circle",
    source: "belis-source",
    "source-layer": "mauerlaschen",
    paint: buildCirclePaint("mauerlaschen"),
  },
  {
    id: "schaltstelle",
    type: "circle",
    source: "belis-source",
    "source-layer": "schaltstelle",
    paint: buildCirclePaint("schaltstelle"),
  },
  // Sprite-based icon overlay for leuchten. The sprite "leuchten" is provided
  // by the main BELIS style (styleY.json → "sprite": ".../belis/sprites") and
  // therefore already loaded on the map; no extra sprite registration needed.
  // Drawn on top of the circle above so the green circle stays visible as an
  // underlay around the icon.
  {
    id: "leuchten-icon",
    type: "symbol",
    source: "belis-source",
    "source-layer": "leuchten",
    layout: {
      "icon-image": sprite("leuchten"),
      "icon-anchor": "center",
      "icon-size": iconSize,
      "icon-allow-overlap": true,
    },
  },
  // Sprite overlays for the remaining point types. Sprite names mirror the
  // *-icon layers in the main Fachobjekte styleY.json:
  //   mast        → standort_mast
  //   abzweigdose → abzweigdose
  //   mauerlasche → mauerlasche
  //   schaltstelle→ schaltstelle
  // Each sits on top of its corresponding green circle (underlay).
  {
    id: "mast-icon",
    type: "symbol",
    source: "belis-source",
    "source-layer": "mast",
    layout: {
      "icon-image": sprite("standort_mast"),
      "icon-anchor": "center",
      "icon-size": iconSize,
      "icon-allow-overlap": true,
    },
  },
  {
    id: "abzweigdosen-icon",
    type: "symbol",
    source: "belis-source",
    "source-layer": "abzweigdosen",
    layout: {
      "icon-image": sprite("abzweigdose"),
      "icon-anchor": "center",
      "icon-size": iconSize,
      "icon-allow-overlap": true,
    },
  },
  {
    id: "mauerlaschen-icon",
    type: "symbol",
    source: "belis-source",
    "source-layer": "mauerlaschen",
    layout: {
      "icon-image": sprite("mauerlasche"),
      "icon-anchor": "center",
      "icon-size": iconSize,
      "icon-allow-overlap": true,
    },
  },
  {
    id: "schaltstelle-icon",
    type: "symbol",
    source: "belis-source",
    "source-layer": "schaltstelle",
    layout: {
      "icon-image": sprite("schaltstelle"),
      "icon-anchor": "center",
      "icon-size": iconSize,
      "icon-allow-overlap": true,
    },
  },
];
