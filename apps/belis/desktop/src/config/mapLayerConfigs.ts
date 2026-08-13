/**
 * MapLibre-compatible layer configurations for Belis.
 *
 * Background layers: one active at a time (radio buttons).
 * Additional layers: multiple can be active (checkboxes).
 * The Leuchten data layer is always on and stays hardcoded in BelisMapWrapper.
 */

import type {
  LibreLayer,
  FilterCategory,
} from "@carma-mapping/engines/maplibre";
import type { ExpressionSpecification } from "maplibre-gl";
import { BELIS_BRAND_NEW_STYLE_PREFIX } from "../constants/belis";

/**
 * Symbol scaling base handed to CarmaMap/LibreMap.
 *
 * CARMA scales every symbol layer by `markerSymbolSize / 35`, so the shared
 * default (35) means "unscaled". The belis styles (styleY.json and the
 * hand-written protocol layers) are authored against the 1.35× rendering that
 * the engine used to apply globally, so belis pins its own base here instead
 * of relying on the shared default.
 */
export const BELIS_ICON_SCALE = 1.35;
export const BELIS_MARKER_SYMBOL_SIZE = 35 * BELIS_ICON_SCALE;

export interface LayerEntry {
  title: string;
  layer: LibreLayer | LibreLayer[];
}

export const backgroundLayerConfigs: Record<string, LayerEntry> = {
  rvrLight: {
    title: "RVR (light)",
    layer: {
      type: "wmts",
      url: "https://geodaten.metropoleruhr.de/spw2/service",
      layers: "spw2_light",
      version: "1.3.0",
      transparent: true,
      format: "image/png",
      tileSize: 512,
      maxZoom: 26,
    },
  },
  liegenschaftskarteGrau: {
    title: "Liegenschaftskarte (grau)",
    layer: {
      type: "wmts",
      url: "https://sl0548-wuppertal-intra.map-hosting.de/forwardingTo/s10221/7098/alkis/services",
      layers: "alkomgw",
      styles: "default",
      version: "1.1.1",
      tileSize: 256,
      maxZoom: 26,
      transparent: true,
      format: "image/png",
    },
  },
  liegenschaftskarteBunt: {
    title: "Liegenschaftskarte (bunt)",
    layer: {
      type: "wmts",
      url: "https://sl0548-wuppertal-intra.map-hosting.de/forwardingTo/s10221/7098/alkis/services",
      layers: "alkomf",
      styles: "default",
      version: "1.1.1",
      tileSize: 256,
      transparent: true,
      format: "image/png",
    },
  },
  trueOrtho: {
    title: "True Orthofoto",
    layer: {
      type: "wms",
      url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
      layers: "GIS-102:trueortho2024",
      tileSize: 256,
      transparent: true,
      maxZoom: 26,
      format: "image/png",
    },
  },
  lbk: {
    title: "Luftbildkarte",
    layer: [
      {
        type: "wmts",
        url: "https://geodaten.metropoleruhr.de/spw2/service",
        layers: "spw2_light_grundriss",
        version: "1.3.0",
        transparent: true,
        format: "image/png",
        maxZoom: 26,
      },
      {
        type: "wms",
        url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
        layers: "GIS-102:trueortho2024",
        tileSize: 256,
        transparent: true,
        maxZoom: 26,
        format: "image/png",
      },
      {
        type: "wmts",
        url: "https://geodaten.metropoleruhr.de/dop/dop_overlay?language=ger",
        layers: "dop_overlay",
        version: "1.3.0",
        format: "image/png",
        transparent: true,
        maxZoom: 26,
      },
    ],
  },
  stadtplanGrau: {
    title: "Stadtplan (grau)",
    layer: {
      type: "vector",
      name: "Stadtplan grau",
      style:
        "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_gry.json",
    },
  },
  stadtplanBunt: {
    title: "Stadtplan (bunt)",
    layer: {
      type: "vector",
      name: "Stadtplan bunt",
      style:
        "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_top.json",
    },
  },
};

/**
 * "esave Daten" — Smart-Lighting-Controller (SLC) sensor points, a GeoJSON
 * source hosted behind a MapLibre style. The style carries its own
 * `carmaconf://infoBoxMapping` function, so a click on a sensor is rendered by
 * the generic CARMA info-box flow (see the esave branch in
 * BelisMapWrapper's handleSelectFromHits).
 */
export const ESAVE_STYLE_URL =
  "https://tiles.cismet.de/belis_sensoren/style.json";
/** Inner source id of ESAVE_STYLE_URL; namespaced by the style URL on the map. */
export const ESAVE_ORIGINAL_SOURCE = "belis-sensoren-source";
/**
 * Key of the esave entry in `additionalLayerConfigs`. The layer is Fachobjekte-
 * only — the Arbeitsaufträge map filters it out by this key, and Settings hides
 * its toggle there.
 */
export const ESAVE_LAYER_KEY = "esaveDaten";

export const additionalLayerConfigs: Record<string, LayerEntry> = {
  stadtFstck: {
    title: "Städtische Flurstücke",
    layer: {
      type: "wmts",
      url: "https://sl0548-wuppertal-intra.map-hosting.de/forwardingTo/s10221/7098/stadt-flurstuecke/services",
      layers: "stadt_flurst",
      version: "1.1.1",
      tileSize: 256,
      transparent: true,
      format: "image/png",
    },
  },
  strassen: {
    title: "Straßen",
    layer: {
      type: "vector",
      name: "Straßen",
      style: "https://tiles.cismet.de/alkis/streets.style.json",
    },
  },
  [ESAVE_LAYER_KEY]: {
    title: "esave Daten",
    layer: {
      type: "vector",
      name: "esave Daten",
      style: ESAVE_STYLE_URL,
    },
  },
  // alkisBlack: {
  //   title: "Alkis Vektorlayer",
  //   layer: {
  //     type: "vector",
  //     name: "Alkis Vektorlayer",
  //     style: "https://tiles.cismet.de/alkis/flurstuecke.black.style.json",
  //   },
  // },
  // need to import bottstrap and cismap in main.tsx for this one to work, so leaving it out for now
};

/** Leuchten (all map features) data layer, always visible */
export const BELIS_STYLE_URL = "https://tiles.cismet.de/belis/styleY.json";
/**
 * Style used for printing. The on-screen styleY draws features white (for the
 * dark map background), which are invisible on the white print page; style.json
 * is the colored variant (registered as `belis-style` on tsgl4printing-wms).
 */
export const BELIS_PRINT_STYLE_URL = "https://tiles.cismet.de/belis/style.json";
export const BELIS_ORIGINAL_SOURCE = "belis-source";

export const leuchtenDataLayer: LibreLayer = {
  type: "vector",
  name: "Leuchten",
  style: BELIS_STYLE_URL,
  opacity: 1,
  // Promote the DB primary key to the MapLibre feature id. Every belis
  // source-layer (leuchten/standorte/mauerlaschen/…) carries a unique `id`;
  // without this, selection/highlight `feature-state` keys by the tile-local
  // MVT id and a DB id passed to setFeatureState aliases unrelated features in
  // other tiles (phantom selections that shift on zoom).
  promoteId: "id",
};

/** Experimental "brand new features" data layer (GeoJSON-backed style).
 * Toggleable in local dev only. */
export const BELIS_BRAND_NEW_PRINT_STYLE_URL =
  "https://tiles.cismet.de/belis/brand.new.features.print.style.json";

export const BELIS_BRAND_NEW_STYLE_URL =
  "https://tiles.cismet.de/belis/brand.new.features.style.json";
// BELIS_BRAND_NEW_FC_URL lives in constants/belis.ts (centralized service link).

export const brandNewDataLayer: LibreLayer = {
  type: "vector",
  name: "BrandNewFeatures",
  style: BELIS_BRAND_NEW_STYLE_URL,
  opacity: 1,
};

/** Arbeitsaufträge GeoJSON layer styles (client-side rendering) */
export const AA_LAYER_STYLES = {
  fill: {
    "fill-color": "#E74C4C",
    "fill-opacity": 0.45,
  },
  outline: {
    "line-color": "#C0392B",
    "line-width": 2,
  },
  selection: {
    "line-color": "#3A7CEB",
    "line-width": 5,
    "line-opacity": [
      "case",
      ["boolean", ["feature-state", "selected"], false],
      1,
      0,
    ] as ExpressionSpecification,
  },
};

export const BELIS_SOURCE_LAYERS = [
  "leuchten",
  "standorte",
  // "mast", // replaced by standorte in styleY
  "mauerlaschen",
  "schaltstelle",
  "leitungen",
  "abzweigdosen",
] as const;

/**
 * Per-category print styles (belis4print). Unlike the on-screen styles — which
 * draw white for the dark map and combine every Fachobjekt into one style — the
 * print server hosts one colored, print-ready style *per category* so the print
 * can mirror the on-map filter toggles (print only the categories that are
 * visible). Two source flavours exist:
 *   - regular  : vector-tile backed  -> belis4print/<cat>.style.json
 *   - brandnew : same-day GeoJSON    -> belis4print/<prefix><cat>.style.json
 *                (prefix = BELIS_BRAND_NEW_STYLE_PREFIX, dev "brand.new.features.",
 *                 live "updated.features.", derived from the FC URL)
 * Leitungen is special: it has one combined style plus one style per Leitungstyp
 * (filtered by `bezeichnung`), so it can mirror the Leitungstyp sub-toggles.
 */
export const BELIS_PRINT_STYLE_BASE = "https://tiles.cismet.de/belis4print";

/** Build the print style URL for a category basename and source flavour. */
export const printCategoryStyleUrl = (
  basename: string,
  brandnew: boolean
): string =>
  brandnew
    ? `${BELIS_PRINT_STYLE_BASE}/${BELIS_BRAND_NEW_STYLE_PREFIX}${basename}.style.json`
    : `${BELIS_PRINT_STYLE_BASE}/${basename}.style.json`;

/**
 * Filter-category key -> print style basename. Leitungen is omitted: it is
 * resolved per Leitungstyp in printLayers.ts (see resolveLeitungenBasenames).
 */
export const BELIS_PRINT_CATEGORY_BASENAMES: Record<string, string> = {
  leuchten: "leuchten",
  standorte: "standorte",
  schaltstellen: "schaltstellen",
  abzweigdosen: "abzweigdosen",
  mauerlaschen: "mauerlaschen",
};

/**
 * Draw order of the printed Fachobjekt layers, bottom -> top. Each category is a
 * separate WMS GetMap composited in this order, so lines/areas go below and the
 * icon-heavy Leuchten on top — matching the on-screen z-order.
 */
export const BELIS_PRINT_CATEGORY_ORDER = [
  "leitungen",
  "mauerlaschen",
  "abzweigdosen",
  "schaltstellen",
  "standorte",
  "leuchten",
] as const;

/**
 * Leitungstyp bezeichnung -> sub-variant slug (the part after "leitungen." in
 * the style filename, e.g. "Tragseil mit Freileitung" -> tragseil-mit-freileitung).
 */
export const leitungstypSlug = (bezeichnung: string): string =>
  bezeichnung.trim().toLowerCase().replace(/\s+/g, "-");

export const BELIS_FILTER_CATEGORIES: FilterCategory[] = [
  {
    key: "leuchten",
    label: "Leuchten",
    sourceLayers: ["leuchten"],
    layerPatterns: ["leuchten"],
  },
  {
    key: "standorte",
    label: "Standorte",
    sourceLayers: ["standorte"],
    layerPatterns: ["standorte"],
  },
  {
    key: "leitungen",
    label: "Leitungen",
    sourceLayers: ["leitungen"],
    layerPatterns: ["leitungen"],
  },
  {
    key: "schaltstellen",
    label: "Schaltstellen",
    sourceLayers: ["schaltstelle"],
    layerPatterns: ["schaltstelle"],
  },
  {
    key: "abzweigdosen",
    label: "Abzweigdosen",
    sourceLayers: ["abzweigdosen"],
    layerPatterns: ["abzweigdose"],
  },
  {
    key: "mauerlaschen",
    label: "Mauerlaschen",
    sourceLayers: ["mauerlaschen"],
    layerPatterns: ["mauerlaschen"],
  },
];
