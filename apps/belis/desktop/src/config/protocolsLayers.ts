import type { LayerSpecification } from "maplibre-gl";
import slugify from "slugify";

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

const statusColor = [
  "match",
  ["get", "status"],
  "offen",
  "#F59E0B",
  "in_bearbeitung",
  "#3B82F6",
  "erledigt",
  "#10B981",
  "fehlmeldung",
  "#EF4444",
  "#22C55E",
] as unknown as string;

const circleRadius = [
  "case",
  ["boolean", ["feature-state", "selected"], false],
  11,
  7,
] as unknown as number;

const strokeColor = [
  "case",
  ["boolean", ["feature-state", "selected"], false],
  "#2563EB",
  "#ffffff",
] as unknown as string;

const strokeWidth = [
  "case",
  ["boolean", ["feature-state", "selected"], false],
  3,
  2,
] as unknown as number;

const lineWidth = [
  "case",
  ["boolean", ["feature-state", "selected"], false],
  7,
  5,
] as unknown as number;

// Wider variant used by the green leitungen underlay so the real-color line on
// top leaves a ~3px green halo on both sides.
const underlayLineWidth = [
  "case",
  ["boolean", ["feature-state", "selected"], false],
  13,
  11,
] as unknown as number;

// Real leitungen coloring copied from styleY.json's "leitungen-base" layer:
// branches on the `bezeichnung` property.
const bezeichnungColor = [
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
] as unknown as string;

const circlePaint = {
  "circle-radius": circleRadius,
  "circle-color": statusColor,
  "circle-stroke-width": strokeWidth,
  "circle-stroke-color": strokeColor,
};

/**
 * Zoom-based icon sizing, copied from the main Fachobjekte styleY.json
 * (leuchten-icon layer). Kept identical so the protocol icons visually match
 * the main map at every zoom level.
 */
const iconSize = [
  "interpolate",
  ["linear"],
  ["zoom"],
  10,
  0.05,
  16,
  0.3,
  23,
  0.6,
] as unknown as number;

export const protocolsLayers: LayerSpecification[] = [
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
    paint: circlePaint,
  },
  {
    id: "mast",
    type: "circle",
    source: "belis-source",
    "source-layer": "mast",
    paint: circlePaint,
  },
  {
    id: "abzweigdosen",
    type: "circle",
    source: "belis-source",
    "source-layer": "abzweigdosen",
    paint: circlePaint,
  },
  {
    id: "mauerlaschen",
    type: "circle",
    source: "belis-source",
    "source-layer": "mauerlaschen",
    paint: circlePaint,
  },
  {
    id: "schaltstelle",
    type: "circle",
    source: "belis-source",
    "source-layer": "schaltstelle",
    paint: circlePaint,
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
