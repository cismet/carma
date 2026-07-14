// Best-effort mapping of the BelIS MapLibre layer model onto the engine-
// agnostic PrintInputLayer shape consumed by @carma-mapping/print-core.
//
// The core's getPrintLayers then turns these into MapFish layers:
//   - wms / wmts  -> WMS GetMap against `url` with `layers`
//   - vector      -> tgl4printing WMS keyed by getStyleName(style)
//
// The Fachobjekt data layers (Leuchten, Standorte, …) are NOT printed via the
// on-screen styleY/brand.new styles: those draw white for the dark map and are
// invisible on the white page. Instead each *visible* category is printed via
// its own colored belis4print style, so the print mirrors the on-map filter
// toggles (category + Leitungstyp sub-type + regular/brandnew source).

import type { Map as MaplibreMap, GeoJSONFeature } from "maplibre-gl";

import type { PrintInputLayer } from "@carma-mapping/print-core";
import type { LibreLayer } from "@carma-mapping/engines/maplibre";
import { buildFeatureStateTarget } from "@carma-mapping/utils";

import {
  additionalLayerConfigs,
  backgroundLayerConfigs,
  BELIS_PRINT_CATEGORY_BASENAMES,
  BELIS_PRINT_CATEGORY_ORDER,
  BELIS_SOURCE_LAYERS,
  leitungstypSlug,
  printCategoryStyleUrl,
} from "../config/mapLayerConfigs";
import {
  createBelisInlinePrintStyle,
  type BelisPrintFeature,
} from "../config/belisPrintStyle";

const toInputLayer = (
  layer: LibreLayer,
  fallbackOpacity: number
): PrintInputLayer | null => {
  switch (layer.type) {
    case "wms":
    case "wmts":
      return {
        visible: true,
        layerType: layer.type,
        url: layer.url,
        layers: layer.layers,
        opacity: layer.opacity ?? fallbackOpacity,
      };
    case "vector": {
      // Inline StyleSpecification objects carry no style name/URL to derive
      // a tgl4printing style from; only string styles are printable.
      if (typeof layer.style !== "string") {
        return null;
      }
      return {
        visible: true,
        layerType: "vector",
        style: layer.style,
        props: { style: layer.style },
        opacity: layer.opacity ?? fallbackOpacity,
      };
    }
    // geojson / cog layers have no MapFish equivalent here.
    default:
      return null;
  }
};

const expand = (entry: LibreLayer | LibreLayer[]): LibreLayer[] =>
  Array.isArray(entry) ? entry : [entry];

interface Leitungstyp {
  id: number;
  bezeichnung?: string;
}

/**
 * Resolve which Leitungen print-style basenames to use, mirroring the on-map
 * Leitungstyp filter (applyLeitungenFilter):
 *   - all types enabled (or none explicitly set) -> the combined "leitungen"
 *   - a subset enabled -> one "leitungen.<slug>" per enabled Leitungstyp
 *   - key table not loaded yet -> fall back to the combined style
 */
const resolveLeitungenBasenames = (
  enabledLeitungstypen: Record<number, boolean>,
  leitungstypen: Leitungstyp[]
): string[] => {
  if (!leitungstypen || leitungstypen.length === 0) return ["leitungen"];

  const noneExplicitlySet = Object.keys(enabledLeitungstypen).length === 0;
  const allEnabled = leitungstypen.every(
    (t) => enabledLeitungstypen[t.id] !== false
  );
  if (allEnabled || noneExplicitlySet) return ["leitungen"];

  return leitungstypen
    .filter((t) => enabledLeitungstypen[t.id] !== false && t.bezeichnung)
    .map((t) => `leitungen.${leitungstypSlug(t.bezeichnung as string)}`);
};

/**
 * Resolve which Leitungstyp bezeichnungen may print, mirroring the on-map
 * Leitungstyp filter (applyLeitungenFilter):
 *   - key table not loaded, all types enabled, or none explicitly set
 *     -> null ("no filter"; every Leitung prints)
 *   - a subset enabled -> a Set of the enabled bezeichnungen; a Leitung prints
 *     only when its `bezeichnung` property is in the set.
 */
const resolveLeitungenAllowedNames = (
  enabledLeitungstypen: Record<number, boolean>,
  leitungstypen: Leitungstyp[]
): Set<string> | null => {
  if (!leitungstypen || leitungstypen.length === 0) return null;

  const noneExplicitlySet = Object.keys(enabledLeitungstypen).length === 0;
  const allEnabled = leitungstypen.every(
    (t) => enabledLeitungstypen[t.id] !== false
  );
  if (allEnabled || noneExplicitlySet) return null;

  return new Set(
    leitungstypen
      .filter((t) => enabledLeitungstypen[t.id] !== false && t.bezeichnung)
      .map((t) => t.bezeichnung as string)
  );
};

/**
 * Build the print-style basenames for every visible Fachobjekt category, in
 * bottom -> top draw order. A category contributes only when its filter toggle
 * is on (missing/true = on, matching the on-map behaviour).
 */
const buildVisibleCategoryBasenames = (params: {
  enabledCategoryFilters: Record<string, boolean>;
  enabledLeitungstypen: Record<number, boolean>;
  leitungstypen: Leitungstyp[];
}): string[] => {
  const { enabledCategoryFilters, enabledLeitungstypen, leitungstypen } =
    params;

  const out: string[] = [];
  for (const key of BELIS_PRINT_CATEGORY_ORDER) {
    if (enabledCategoryFilters[key] === false) continue;
    if (key === "leitungen") {
      out.push(...resolveLeitungenBasenames(enabledLeitungstypen, leitungstypen));
    } else {
      const basename = BELIS_PRINT_CATEGORY_BASENAMES[key];
      if (basename) out.push(basename);
    }
  }
  return out;
};

/**
 * Source-layer name -> on-map category filter key. Mostly identity; only
 * schaltstelle (layer, singular) vs schaltstellen (filter, plural) differ.
 */
const SOURCE_LAYER_TO_FILTER_KEY: Record<string, string> = {
  leuchten: "leuchten",
  standorte: "standorte",
  mauerlaschen: "mauerlaschen",
  schaltstelle: "schaltstellen",
  leitungen: "leitungen",
  abzweigdosen: "abzweigdosen",
};

/** Bounding box [west, south, east, north] in WGS84. */
type Bbox = [number, number, number, number];

/** Visit every [lng, lat] position in an arbitrarily-nested coordinate array. */
const eachPosition = (
  coords: unknown,
  cb: (x: number, y: number) => void
): void => {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    cb(coords[0] as number, coords[1] as number);
    return;
  }
  for (const c of coords) eachPosition(c, cb);
};

interface GeomStats {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** vertex count — used to keep the richest of several tile-clipped copies. */
  n: number;
}

const geometryStats = (geometry: GeoJSON.Geometry): GeomStats => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let n = 0;
  eachPosition((geometry as { coordinates?: unknown }).coordinates, (x, y) => {
    n++;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  });
  return { minX, minY, maxX, maxY, n };
};

/** True when the geometry's bbox overlaps the print rectangle bbox. */
const statsIntersectBbox = (s: GeomStats, bbox: Bbox): boolean =>
  !(s.maxX < bbox[0] || s.minX > bbox[2] || s.maxY < bbox[1] || s.minY > bbox[3]);

/**
 * Assemble a single inline-geojson Fachobjekt print layer from the LIVE map:
 * query the currently-loaded features from the belis source(s), keep only those
 * inside the print rectangle, bake the selection / highlight / neighborhood
 * feature-state into their properties, and embed them into the self-contained
 * print style (see belisPrintStyle.ts).
 *
 * This replaces the per-category hosted belis4print styles: nothing is fetched
 * at render time, so brand-new (geojson-only) features are no longer blank, and
 * selection/highlight render because the print style reads them from properties.
 *
 * querySourceFeatures returns tile-clipped features, duplicated once per tile
 * across the whole loaded viewport — so we (a) clip to the print bbox and (b)
 * de-duplicate by id, keeping the copy with the most vertices. Without this the
 * request body overflows the print server (HTTP 413).
 *
 * Returns null when there is nothing to print.
 *
 * NOTE: both the category-level filter toggles and the Leitungstyp sub-filter
 * are mirrored — a Leitung is only printed when its `bezeichnung` matches an
 * enabled Leitungstyp (see resolveLeitungenAllowedNames), just like the on-map
 * applyLeitungenFilter.
 */
export const buildBelisInlineFachobjekteLayer = (params: {
  map: MaplibreMap;
  /** Namespaced vector-tile source id (`${slugifyUrl(styleUrl)}::belis-source`). */
  namespacedSource: string;
  /** Namespaced brand-new geojson source id. */
  brandnewSource: string;
  enabledCategoryFilters: Record<string, boolean>;
  /** On-map Leitungstyp sub-filter (id -> enabled, missing/true = visible). */
  enabledLeitungstypen: Record<number, boolean>;
  /** Leitungstyp key table (id -> bezeichnung) for sub-variant matching. */
  leitungstypen: Leitungstyp[];
  regularEnabled: boolean;
  brandnewEnabled: boolean;
  /**
   * Whether on-map highlight mode is active. When true, only actually-
   * highlighted features stay full opacity and the rest are dimmed; when false,
   * every printed feature is marked highlighted (fully visible).
   */
  highlightingActive: boolean;
  /** Print rectangle bbox (WGS84); when set, only features inside are printed. */
  bbox?: Bbox;
}): PrintInputLayer | null => {
  const {
    map,
    namespacedSource,
    brandnewSource,
    enabledCategoryFilters,
    enabledLeitungstypen,
    leitungstypen,
    regularEnabled,
    brandnewEnabled,
    highlightingActive,
    bbox,
  } = params;

  // key `${sourceLayer}:${id}` -> best (richest-geometry) copy seen so far.
  const byId = new Map<string, { feature: BelisPrintFeature; n: number }>();

  const categoryVisible = (sourceLayer: string): boolean => {
    const key = SOURCE_LAYER_TO_FILTER_KEY[sourceLayer] ?? sourceLayer;
    return enabledCategoryFilters[key] !== false;
  };

  // Leitungstyp sub-filter: null = print all Leitungen; otherwise a Leitung is
  // printed only when its `bezeichnung` is in the allowed set (mirrors the
  // on-map applyLeitungenFilter's `["in", ["get","bezeichnung"], …]`).
  const allowedLeitungenNames = resolveLeitungenAllowedNames(
    enabledLeitungstypen,
    leitungstypen
  );
  const leitungstypVisible = (
    sourceLayer: string,
    props: Record<string, unknown> | undefined
  ): boolean => {
    if (sourceLayer !== "leitungen" || allowedLeitungenNames === null)
      return true;
    return allowedLeitungenNames.has(props?.bezeichnung as string);
  };

  const readState = (
    source: string,
    sourceLayer: string | undefined,
    id: string | number | undefined
  ): Record<string, unknown> => {
    if (id == null) return {};
    try {
      return (
        (map.getFeatureState(
          buildFeatureStateTarget(map, { source, sourceLayer, id })
        ) as Record<string, unknown>) ?? {}
      );
    } catch {
      return {};
    }
  };

  const addFeature = (
    source: string,
    sourceLayer: string,
    f: GeoJSONFeature
  ): void => {
    if (!f.geometry) return;
    if (!leitungstypVisible(sourceLayer, f.properties)) return;
    const stats = geometryStats(f.geometry);
    if (bbox && !statsIntersectBbox(stats, bbox)) return;

    const id =
      f.id ?? (f.properties?.id as string | number | undefined) ?? undefined;
    const key = `${sourceLayer}:${id ?? ""}`;
    // Keep the copy with the most vertices (least tile-clipping); features with
    // no id can't be de-duped, so give each a unique key.
    const existing = byId.get(key);
    if (id != null && existing && existing.n >= stats.n) return;

    const st = readState(source, sourceLayer, id);
    const p = f.properties ?? {};
    // Keep the full property set (matching the backend example), plus the
    // category the layer filters read (["get","sourceLayer"]). State flags are
    // written ONLY when true — the style's ["get", …] rules already treat a
    // missing flag as false, so emitting `false` is dead weight.
    const properties: Record<string, unknown> = {
      ...p,
      id: id ?? 0,
      sourceLayer,
      // Mirror the on-map highlight mode: with highlighting active, only the
      // actually-highlighted features stay full opacity and the rest are dimmed;
      // with it off, everything prints fully visible. The print style has no
      // global-state gate, so the dimming is driven purely by this property.
      highlighted: highlightingActive ? !!st.highlighted : true,
    };
    if (st.selected) properties.selected = true;
    if (st.selectionInNeighborhood) properties.selectionInNeighborhood = true;

    const feature: BelisPrintFeature = {
      id: id ?? 0,
      type: "Feature",
      sourceLayer,
      geometry: f.geometry,
      properties,
    };
    byId.set(id != null ? key : `${key}:${byId.size}`, { feature, n: stats.n });
  };

  // Regular (vector-tile) source: query per source-layer.
  if (regularEnabled && map.getSource(namespacedSource)) {
    for (const sl of BELIS_SOURCE_LAYERS) {
      if (!categoryVisible(sl)) continue;
      let feats: GeoJSONFeature[] = [];
      try {
        feats = map.querySourceFeatures(namespacedSource, { sourceLayer: sl });
      } catch {
        feats = [];
      }
      for (const f of feats) addFeature(namespacedSource, sl, f);
    }
  }

  // Brand-new (geojson) source: one flat source; category = properties._sourceLayer.
  if (brandnewEnabled && map.getSource(brandnewSource)) {
    let feats: GeoJSONFeature[] = [];
    try {
      feats = map.querySourceFeatures(brandnewSource);
    } catch {
      feats = [];
    }
    for (const f of feats) {
      // GeoJSON sources have no native source-layer; the brand-new pipeline
      // stamps the category into properties._sourceLayer (sourceLayerStamp).
      const sl = (f.properties?._sourceLayer as string) || "";
      if (!sl || !categoryVisible(sl)) continue;
      addFeature(brandnewSource, sl, f);
    }
  }

  if (byId.size === 0) return null;

  const features = Array.from(byId.values(), (v) => v.feature);
  return {
    visible: true,
    layerType: "inline",
    inlineStyle: createBelisInlinePrintStyle(features),
    opacity: 1,
  };
};

/**
 * Build the printable layer stack in draw order (bottom -> top):
 * active background, then active additional overlays, then the visible
 * Fachobjekt data layers. When `inlineFachobjekteLayer` is provided it is used
 * for the Fachobjekte (inline geojson, current selection baked in); otherwise
 * the legacy per-category belis4print vector styles are emitted as a fallback.
 * getPrintLayers reverses via unshift, so this order yields the Fachobjekte on
 * top of the overlays on top of the background.
 */
export const buildBelisPrintLayers = (params: {
  activeBackgroundLayer: string;
  backgroundLayerOpacities: Record<string, number>;
  activeAdditionalLayers: string[];
  additionalLayerOpacities: Record<string, number>;
  /** On-map category filter (missing/true = visible). */
  enabledCategoryFilters: Record<string, boolean>;
  /** On-map Leitungstyp sub-filter (id -> enabled, missing/true = visible). */
  enabledLeitungstypen: Record<number, boolean>;
  /** Leitungstyp key table (id -> bezeichnung) for sub-variant style lookup. */
  leitungstypen: Leitungstyp[];
  /** Source flavours visible on the map (default both on). */
  regularEnabled: boolean;
  brandnewEnabled: boolean;
  /**
   * When provided, a single inline-geojson Fachobjekt layer (built from the live
   * map via buildBelisInlineFachobjekteLayer) replaces the per-category hosted
   * belis4print vector styles. null means "nothing to print for Fachobjekte".
   */
  inlineFachobjekteLayer?: PrintInputLayer | null;
}): PrintInputLayer[] => {
  const {
    activeBackgroundLayer,
    backgroundLayerOpacities,
    activeAdditionalLayers,
    additionalLayerOpacities,
    enabledCategoryFilters,
    enabledLeitungstypen,
    leitungstypen,
    regularEnabled,
    brandnewEnabled,
    inlineFachobjekteLayer,
  } = params;
  const useInline = inlineFachobjekteLayer !== undefined;

  const out: PrintInputLayer[] = [];

  const pushEntry = (
    entry: LibreLayer | LibreLayer[] | undefined,
    opacity: number
  ) => {
    if (!entry) return;
    for (const libreLayer of expand(entry)) {
      const mapped = toInputLayer(libreLayer, opacity);
      if (mapped) out.push(mapped);
    }
  };

  // Background (one active at a time).
  const bg = backgroundLayerConfigs[activeBackgroundLayer];
  pushEntry(bg?.layer, backgroundLayerOpacities[activeBackgroundLayer] ?? 1);

  // Additional overlays (any number active), in their activation order.
  for (const key of activeAdditionalLayers) {
    pushEntry(
      additionalLayerConfigs[key]?.layer,
      additionalLayerOpacities[key] ?? 1
    );
  }

  // Preferred path: one inline-geojson layer with the live features + selection
  // baked in (nothing fetched at render time). undefined => caller didn't opt in
  // (use the legacy per-category styles); null => opted in but nothing to print.
  if (useInline) {
    if (inlineFachobjekteLayer) out.push(inlineFachobjekteLayer);
    return out;
  }

  // Legacy fallback: visible Fachobjekt categories, one colored print style per
  // category / Leitungstyp. Regular sits below its brandnew counterpart so
  // same-day edits stay visible; both only when the source is shown on the map.
  const basenames = buildVisibleCategoryBasenames({
    enabledCategoryFilters,
    enabledLeitungstypen,
    leitungstypen,
  });
  const pushPrintStyle = (url: string) => {
    out.push({
      visible: true,
      layerType: "vector",
      style: url,
      props: { style: url },
      opacity: 1,
    });
  };
  for (const basename of basenames) {
    if (regularEnabled) pushPrintStyle(printCategoryStyleUrl(basename, false));
    if (brandnewEnabled) pushPrintStyle(printCategoryStyleUrl(basename, true));
  }

  return out;
};
