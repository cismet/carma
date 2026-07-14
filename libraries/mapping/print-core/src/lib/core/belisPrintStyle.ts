// Self-contained MapLibre print style for BelIS ("inline" tgl-wms rendering).
//
// This is the backend-supplied, print-ready style: ONE style covering every
// Fachobjekt category. Unlike the on-screen styleY.json it
//   - reads selection state from feature PROPERTIES (["get","selected"] etc.)
//     instead of feature-state, because the static tgl-wms renderer has no
//     feature-state, and
//   - carries its data inline via a geojson source instead of vector tiles, so
//     nothing is fetched at render time (fixes blank brand-new prints).
//
// The style is a FIXED template. At print time we clone it and drop the
// currently-visible features into sources["belis-source"].data — see
// buildBelisInlinePrintLayer in ../helper/printLayers.ts.
//
// Highlighting is always "on" in print: the on-screen global-state gate
// (highlightingEnabled) is dropped here, so non-highlighted features are dimmed
// (0 -> 0.05 -> 0.15 by zoom) and selected/highlighted ones stand out.

/** A GeoJSON feature ready to embed into the inline print source. */
export interface BelisPrintFeature {
  id: string | number;
  type: "Feature";
  /** tgl-wms matches this against each style layer's `source-layer`. */
  sourceLayer: string;
  geometry: GeoJSON.Geometry;
  properties: Record<string, unknown>;
}

const iconSizeStops = [
  "interpolate",
  ["linear"],
  ["zoom"],
  10,
  0.05,
  16,
  0.3,
  23,
  0.6,
];

/**
 * The fixed print-style template. `sources["belis-source"].data` is an empty
 * FeatureCollection here; buildBelisInlinePrintLayer replaces it per print.
 */
export const BELIS_INLINE_PRINT_STYLE_TEMPLATE: Record<string, unknown> = {
  version: 8,
  sprite: "https://tiles.cismet.de/belis/sprites",
  glyphs: "https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf",
  sources: {
    "belis-source": {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
      minzoom: 9,
      maxzoom: 14,
    },
  },
  layers: [
    {
      id: "leitungen-selection-helper-underlay-almost-invisible",
      type: "line",
      source: "belis-source",
      "source-layer": "leitungen",
      minzoom: 0,
      maxzoom: 22,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#FFFFFF",
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3, 16, 10, 22, 20],
        "line-opacity": 0.01,
      },
    },
    {
      id: "leitungen-base",
      type: "line",
      source: "belis-source",
      "source-layer": "leitungen",
      minzoom: 0,
      maxzoom: 22,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": [
          "case",
          ["boolean", ["get", "selected"], false],
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
        ],
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 16, 2, 22, 6],
        "line-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          [
            "case",
            ["boolean", ["get", "selected"], false],
            1,
            ["!", ["boolean", ["get", "highlighted"], false]],
            0,
            0.9,
          ],
          14,
          [
            "case",
            ["boolean", ["get", "selected"], false],
            1,
            ["!", ["boolean", ["get", "highlighted"], false]],
            0.05,
            0.9,
          ],
          16,
          [
            "case",
            ["boolean", ["get", "selected"], false],
            1,
            ["!", ["boolean", ["get", "highlighted"], false]],
            0.15,
            0.9,
          ],
        ],
      },
    },
    {
      id: "leuchten-selection",
      type: "symbol",
      source: "belis-source",
      "source-layer": "leuchten",
      minzoom: 0,
      maxzoom: 24,
      layout: {
        "icon-image": "Icon_Full",
        "icon-anchor": "center",
        "icon-size": iconSizeStops,
        "icon-allow-overlap": true,
      },
      paint: {
        "icon-opacity": [
          "case",
          ["boolean", ["get", "selected"], false],
          0.7,
          ["boolean", ["get", "selectionInNeighborhood"], false],
          0.7,
          0,
        ],
      },
    },
    {
      id: "leuchten-icon",
      type: "symbol",
      source: "belis-source",
      "source-layer": "leuchten",
      minzoom: 0,
      maxzoom: 24,
      layout: {
        "icon-image": [
          "case",
          [">", ["coalesce", ["get", "leuchten_count"], 1], 12],
          "leuchtenMax",
          ["concat", "leuchten", ["to-string", ["coalesce", ["get", "leuchten_count"], 1]]],
        ],
        "icon-size": iconSizeStops,
        "icon-allow-overlap": true,
      },
      paint: {
        "icon-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          [
            "case",
            ["!", ["boolean", ["get", "highlighted"], false]],
            ["/", 0, ["coalesce", ["get", "leuchten_count"], 1]],
            1,
          ],
          14,
          [
            "case",
            ["!", ["boolean", ["get", "highlighted"], false]],
            ["/", 0.05, ["coalesce", ["get", "leuchten_count"], 1]],
            1,
          ],
          16,
          [
            "case",
            ["!", ["boolean", ["get", "highlighted"], false]],
            ["/", 0.15, ["coalesce", ["get", "leuchten_count"], 1]],
            1,
          ],
        ],
      },
    },
    {
      id: "abzweigdosen-selection",
      type: "symbol",
      source: "belis-source",
      "source-layer": "abzweigdosen",
      minzoom: 0,
      maxzoom: 24,
      layout: {
        "icon-image": "Icon_Full",
        "icon-size": iconSizeStops,
        "icon-allow-overlap": true,
      },
      paint: {
        "icon-opacity": ["case", ["boolean", ["get", "selected"], false], 0.7, 0],
      },
    },
    {
      id: "abzweigdosen-icon",
      type: "symbol",
      source: "belis-source",
      "source-layer": "abzweigdosen",
      minzoom: 0,
      maxzoom: 24,
      layout: {
        "icon-image": "abzweigdose",
        "icon-size": iconSizeStops,
        "icon-allow-overlap": true,
      },
      paint: {
        "icon-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          ["case", ["!", ["boolean", ["get", "highlighted"], false]], 0, 1],
          14,
          ["case", ["!", ["boolean", ["get", "highlighted"], false]], 0.05, 1],
          16,
          ["case", ["!", ["boolean", ["get", "highlighted"], false]], 0.15, 1],
        ],
      },
    },
    {
      id: "mauerlaschen-selection",
      type: "symbol",
      source: "belis-source",
      "source-layer": "mauerlaschen",
      minzoom: 0,
      maxzoom: 24,
      layout: {
        "icon-image": "Icon_Full",
        "icon-size": iconSizeStops,
        "icon-allow-overlap": true,
      },
      paint: {
        "icon-opacity": ["case", ["boolean", ["get", "selected"], false], 0.7, 0],
      },
    },
    {
      id: "mauerlaschen-icon",
      type: "symbol",
      source: "belis-source",
      "source-layer": "mauerlaschen",
      minzoom: 0,
      maxzoom: 24,
      layout: {
        "icon-image": "mauerlasche",
        "icon-size": iconSizeStops,
        "icon-allow-overlap": true,
      },
      paint: {
        "icon-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          ["case", ["!", ["boolean", ["get", "highlighted"], false]], 0, 1],
          14,
          ["case", ["!", ["boolean", ["get", "highlighted"], false]], 0.05, 1],
          16,
          ["case", ["!", ["boolean", ["get", "highlighted"], false]], 0.15, 1],
        ],
      },
    },
    {
      id: "schaltstelle-selection",
      type: "symbol",
      source: "belis-source",
      "source-layer": "schaltstelle",
      minzoom: 0,
      maxzoom: 24,
      layout: {
        "icon-image": "Icon_Full",
        "icon-size": iconSizeStops,
        "icon-allow-overlap": true,
      },
      paint: {
        "icon-opacity": ["case", ["boolean", ["get", "selected"], false], 0.7, 0],
      },
    },
    {
      id: "schaltstelle-icon",
      type: "symbol",
      source: "belis-source",
      "source-layer": "schaltstelle",
      minzoom: 0,
      maxzoom: 24,
      layout: {
        "icon-image": "schaltstelle",
        "icon-size": iconSizeStops,
        "icon-allow-overlap": true,
      },
      paint: {
        "icon-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          ["case", ["!", ["boolean", ["get", "highlighted"], false]], 0, 1],
          14,
          ["case", ["!", ["boolean", ["get", "highlighted"], false]], 0.05, 1],
          16,
          ["case", ["!", ["boolean", ["get", "highlighted"], false]], 0.15, 1],
        ],
      },
    },
    {
      id: "standorte-selection",
      type: "symbol",
      source: "belis-source",
      "source-layer": "standorte",
      minzoom: 0,
      maxzoom: 24,
      layout: {
        "icon-image": "Icon_Full",
        "icon-anchor": "center",
        "icon-size": iconSizeStops,
        "icon-allow-overlap": true,
      },
      paint: {
        "icon-opacity": [
          "case",
          ["boolean", ["get", "selected"], false],
          0.7,
          ["boolean", ["get", "selectionInNeighborhood"], false],
          0.7,
          0,
        ],
      },
    },
    {
      id: "standorte-icon",
      type: "symbol",
      source: "belis-source",
      "source-layer": "standorte",
      minzoom: 0,
      maxzoom: 24,
      layout: {
        "icon-image": [
          "case",
          ["==", ["coalesce", ["get", "leuchten_count"], 0], 0],
          "standort_mast",
          [">", ["coalesce", ["get", "leuchten_count"], 0], 12],
          "leuchtenMax",
          ["concat", "leuchten", ["to-string", ["get", "leuchten_count"]]],
        ],
        "icon-size": iconSizeStops,
        "icon-allow-overlap": true,
      },
      paint: {
        "icon-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          ["case", ["!", ["boolean", ["get", "highlighted"], false]], 0, 1],
          14,
          ["case", ["!", ["boolean", ["get", "highlighted"], false]], 0.05, 1],
          16,
          ["case", ["!", ["boolean", ["get", "highlighted"], false]], 0.15, 1],
        ],
      },
    },
    {
      id: "standorte-label",
      type: "symbol",
      source: "belis-source",
      "source-layer": "standorte",
      minzoom: 17,
      maxzoom: 24,
      layout: {
        "text-field": ["get", "lfd_nummer"],
        "text-font": ["Open Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 18, 16, 20, 24, 23, 30],
        "text-anchor": "left",
        "text-radial-offset": [
          "interpolate",
          ["linear"],
          ["zoom"],
          18,
          0.65,
          20,
          0.65,
          22,
          0.65,
        ],
        "text-offset": [0, -0.3],
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#333333",
        "text-halo-color": "#FFFFFF",
        "text-halo-width": 1.5,
        "text-opacity": [
          "case",
          ["boolean", ["get", "selected"], false],
          0,
          ["boolean", ["get", "selectionInNeighborhood"], false],
          0,
          ["!", ["boolean", ["get", "highlighted"], false]],
          0.15,
          1,
        ],
      },
    },
    {
      id: "standorte-label-selected",
      type: "symbol",
      source: "belis-source",
      "source-layer": "standorte",
      minzoom: 17,
      maxzoom: 24,
      layout: {
        "text-field": ["get", "lfd_nummer"],
        "text-font": ["Open Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 18, 16, 20, 24, 23, 30],
        "text-anchor": "left",
        "text-radial-offset": [
          "interpolate",
          ["linear"],
          ["zoom"],
          18,
          1.25,
          20,
          1.25,
          22,
          1.25,
        ],
        "text-offset": [0, -0.3],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": "#4892F0",
        "text-halo-color": "#FFFFFF",
        "text-halo-width": 1.5,
        "text-opacity": ["case", ["boolean", ["get", "selected"], false], 1, 0],
      },
    },
    {
      id: "leuchten-debug-circle",
      type: "circle",
      source: "belis-source",
      "source-layer": "leuchten",
      minzoom: 0,
      maxzoom: 24,
      paint: {
        "circle-radius": 2,
        "circle-color": "#FFFFFF",
        "circle-stroke-color": "#333333",
        "circle-stroke-width": 0.5,
        "circle-opacity": 0,
        "circle-stroke-opacity": 0,
      },
      layout: { visibility: "none" },
    },
  ],
};

/** Clone the template and inject the given features into the belis-source. */
export const createBelisInlinePrintStyle = (
  features: BelisPrintFeature[]
): Record<string, unknown> => {
  const style = JSON.parse(
    JSON.stringify(BELIS_INLINE_PRINT_STYLE_TEMPLATE)
  ) as Record<string, unknown>;
  const sources = style.sources as Record<string, { data: unknown }>;
  sources["belis-source"].data = { type: "FeatureCollection", features };
  // belis-source is a geojson source, which has NO real source-layers — every
  // layer would otherwise draw every feature (Leuchten as lines, Leitungen with
  // icons, …). Constrain each layer to its own category by matching the
  // `sourceLayer` property baked into each feature.
  const layers = style.layers as Array<Record<string, unknown>>;
  for (const layer of layers) {
    const sl = layer["source-layer"];
    if (typeof sl === "string") {
      layer.filter = ["==", ["get", "sourceLayer"], sl];
    }
  }
  return style;
};
