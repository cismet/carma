// Inline-vector print support for the Leaflet print path.
//
// PROBLEM
// Geoportal prints a vector layer as a static, server-hosted style reference
// (getStyleName -> tgl-wms "<name>-style"), so the tgl4printing WMS re-renders
// the WHOLE style.json server-side. The on-map filter is a *client-side*
// map.setFilter(...) that never leaves the browser, so a filtered layer (e.g.
// Wohnlagen with only "gut"/"exklusiv" shown) prints ALL its classes.
//
// FIX (mirrors what BelIS does, apps/belis/desktop/src/helper/printLayers.ts)
// For a vector layer that is *actually filtered*, harvest the live features from
// its MapLibre map, keep only those inside the print rectangle, and print them as
// a self-contained inline MapLibre style (data baked in) via the tgl-wms "inline"
// renderer. The style layers are cloned straight from the live map, so paint and
// filtering are identical to what is on screen. Unfiltered layers are left alone
// and keep the existing hosted-style path.
//
// This module is print-only and app-agnostic: it takes a MapLibre map instance,
// the app's layer object, and the print bbox — nothing app-specific is imported.

import type { Map as MaplibreMap } from "maplibre-gl";

// ---------------------------------------------------------------------------
// Loose shapes for the parts of the app layer object we read. Kept local so the
// print library stays decoupled from the app's layer typings.
// ---------------------------------------------------------------------------

interface FilterOption {
  key: string;
  propertyName: string;
  propertyValue: unknown;
}
interface FilterConfig {
  layerPattern?: string;
  filterMode?: string; // "or" -> ["any", …]; anything else -> ["all", …]
  filters?: FilterOption[];
}
type FilterState = Record<string, boolean>;
interface FilterInfo {
  activeCount?: number;
  totalCount?: number;
  isShowingAll?: boolean;
}
interface PrintLayerLike {
  filterConfig?: FilterConfig;
  filterState?: FilterState;
  filterInfo?: FilterInfo;
}

/** Bounding box [west, south, east, north] in WGS84 (lng/lat). */
export type Bbox = [number, number, number, number];

/** GeoJSON source id used by the generated inline print style. */
const INLINE_SOURCE_ID = "print-inline-source";
/** Property key the inline style layers use to re-scope per original source-layer. */
const SOURCE_LAYER_PROP = "_printSourceLayer";

// ---------------------------------------------------------------------------
// A. Should this vector layer be inlined?
// ---------------------------------------------------------------------------

/**
 * True when the layer carries an active on-map filter, i.e. it is NOT showing
 * all of its classes. Only these layers need the inline treatment; unfiltered
 * layers keep the cheaper hosted-style print path.
 */
export const layerHasActiveFilter = (layer: PrintLayerLike | undefined): boolean => {
  const config = layer?.filterConfig;
  const state = layer?.filterState;
  if (!config || !state) return false;

  const info = layer?.filterInfo;
  if (info && typeof info.isShowingAll === "boolean") return !info.isShowingAll;
  if (info && info.activeCount != null && info.totalCount != null) {
    return info.activeCount < info.totalCount;
  }
  // Fallback: any class explicitly disabled.
  return Object.values(state).some((v) => v === false);
};

/**
 * Build the MapLibre filter expression for the user's class selection, mirroring
 * the app's buildFilterExpression (GenericFilterButtonsFactory.tsx). Used only to
 * PRE-FILTER querySourceFeatures so the request body stays small — the cloned
 * style layers still carry the authoritative filter, so this never needs to be
 * exact, only conservative (it must not drop a feature the style would draw).
 *
 *   - all classes enabled -> null (no pre-filter)
 *   - a subset enabled     -> ["any"|"all", ["==", ["get", prop], value], …]
 *   - none enabled         -> a match-nothing expression
 */
const buildUserFilterExpression = (
  config: FilterConfig,
  state: FilterState
): unknown[] | null => {
  const options = config.filters ?? [];
  const enabled = options.filter((o) => state[o.key]);
  if (options.length > 0 && enabled.length === options.length) return null;
  if (enabled.length === 0) return ["==", ["literal", 1], ["literal", 0]];
  const op = config.filterMode === "or" ? "any" : "all";
  return [op, ...enabled.map((o) => ["==", ["get", o.propertyName], o.propertyValue])];
};

// ---------------------------------------------------------------------------
// B. Geometry helpers (lifted from BelIS printLayers.ts) — bbox clip + de-dup.
// ---------------------------------------------------------------------------

/** Visit every [lng, lat] position in an arbitrarily-nested coordinate array. */
const eachPosition = (coords: unknown, cb: (x: number, y: number) => void): void => {
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

// ---------------------------------------------------------------------------
// C. Style helpers — which properties the style reads (for whitelisting).
// ---------------------------------------------------------------------------

/**
 * Recursively collect every feature property name a style value references, so
 * we can keep exactly those on the inlined features (and drop the rest for size).
 * Handles both forms:
 *   - expressions:            ["get", "wlcode"]  (may be nested anywhere)
 *   - legacy function syntax: { "property": "wlcode", "stops": [...] }
 * Must descend into OBJECTS too (paint/layout are objects, not arrays) — the
 * data-driven color lives inside `paint`, e.g. `fill-color: ["case", ["get", …]]`.
 */
const collectGetProps = (value: unknown, acc: Set<string>): void => {
  if (Array.isArray(value)) {
    if (value[0] === "get" && typeof value[1] === "string") {
      acc.add(value[1]);
    }
    for (const item of value) collectGetProps(item, acc);
    return;
  }
  if (value && typeof value === "object") {
    const prop = (value as { property?: unknown }).property;
    if (typeof prop === "string") acc.add(prop);
    for (const v of Object.values(value)) collectGetProps(v, acc);
  }
};

// ---------------------------------------------------------------------------
// D. Build the inline print style from the live map.
// ---------------------------------------------------------------------------

interface StyleLayerLike {
  id: string;
  type: string;
  source?: string;
  "source-layer"?: string;
  filter?: unknown;
  [key: string]: unknown;
}

/**
 * Derive a self-contained MapLibre print style from the layer's LIVE map:
 *   1. clone every style layer that draws from a (vector) source, keeping its
 *      paint/layout/filter verbatim so it renders exactly like on screen;
 *   2. harvest the currently-loaded features for those source-layers, keep the
 *      ones inside the print bbox, de-dupe tile-clipped copies, and whitelist
 *      only the properties the style actually reads (avoids HTTP 413);
 *   3. put them in ONE geojson source; re-point each cloned layer at it, drop
 *      "source-layer" (geojson has none) and re-scope via a per-source-layer
 *      property filter so multi-source-layer styles don't cross-render.
 *
 * Returns the style object, or null when it cannot inline (no live map / no
 * drawable layers) so the caller can fall back to the hosted-style path.
 */
export const buildInlineVectorStyle = (
  map: MaplibreMap,
  layer: PrintLayerLike,
  bbox?: Bbox
): Record<string, unknown> | null => {
  const style = map.getStyle() as unknown as {
    version?: number;
    name?: string;
    sprite?: unknown;
    glyphs?: unknown;
    layers?: StyleLayerLike[];
  } | null;
  if (!style) return null;

  const sourceLayers = (style.layers ?? []).filter(
    (l) => typeof l.source === "string" && l.type !== "background"
  );
  if (sourceLayers.length === 0) return null;

  // Properties the style reads, so we can drop everything else from features.
  const keepProps = new Set<string>([SOURCE_LAYER_PROP]);
  for (const l of sourceLayers) {
    collectGetProps(l.filter, keepProps);
    collectGetProps(l["paint"], keepProps);
    collectGetProps(l["layout"], keepProps);
  }

  // Pre-filter (payload only). Conservative: never drops a drawable feature.
  const userFilter =
    layer.filterConfig && layer.filterState
      ? buildUserFilterExpression(layer.filterConfig, layer.filterState)
      : null;

  // Unique (source, sourceLayer) pairs referenced by the cloned layers.
  const pairs = new Map<string, { source: string; sourceLayer?: string }>();
  for (const l of sourceLayers) {
    const source = l.source as string;
    const sourceLayer = l["source-layer"];
    pairs.set(`${source}::${sourceLayer ?? ""}`, { source, sourceLayer });
  }

  // key `${sourceLayer}:${id}` -> best (richest-geometry) copy seen so far.
  const byId = new Map<string, { feature: GeoJSON.Feature; n: number }>();

  for (const { source, sourceLayer } of pairs.values()) {
    let feats: Array<GeoJSON.Feature & { id?: string | number }> = [];
    try {
      feats = map.querySourceFeatures(source, {
        sourceLayer,
        filter: (userFilter as never) ?? undefined,
      }) as never;
    } catch {
      feats = [];
    }

    for (const f of feats) {
      if (!f.geometry) continue;
      const stats = geometryStats(f.geometry);
      if (bbox && !statsIntersectBbox(stats, bbox)) continue;

      const rawId =
        f.id ?? (f.properties?.["id"] as string | number | undefined) ?? undefined;
      const key = `${sourceLayer ?? ""}:${rawId ?? ""}`;
      const existing = byId.get(key);
      if (rawId != null && existing && existing.n >= stats.n) continue;

      // Whitelist properties + stamp the original source-layer for re-scoping.
      const src = f.properties ?? {};
      const properties: Record<string, unknown> = {
        [SOURCE_LAYER_PROP]: sourceLayer ?? "",
      };
      for (const k of keepProps) {
        if (k !== SOURCE_LAYER_PROP && src[k] != null) properties[k] = src[k];
      }

      const feature: GeoJSON.Feature = {
        type: "Feature",
        id: rawId,
        geometry: f.geometry,
        properties,
      };
      byId.set(
        rawId != null ? key : `${key}:${byId.size}`,
        { feature, n: stats.n }
      );
    }
  }

  const features = Array.from(byId.values(), (v) => v.feature);

  // Clone the layers, re-point at the inline geojson source, drop source-layer,
  // and constrain each to its original source-layer via the stamped property.
  const printLayers = sourceLayers.map((l) => {
    const clone: StyleLayerLike = { ...l, source: INLINE_SOURCE_ID };
    const originalSourceLayer = clone["source-layer"];
    delete clone["source-layer"];
    if (originalSourceLayer != null) {
      const scope = ["==", ["get", SOURCE_LAYER_PROP], originalSourceLayer];
      clone.filter =
        clone.filter != null ? ["all", scope, clone.filter] : scope;
    }
    return clone;
  });

  return {
    version: style.version ?? 8,
    name: style.name ?? "print-inline",
    ...(style.sprite != null ? { sprite: style.sprite } : {}),
    ...(style.glyphs != null ? { glyphs: style.glyphs } : {}),
    sources: {
      [INLINE_SOURCE_ID]: {
        type: "geojson",
        data: { type: "FeatureCollection", features },
      },
    },
    layers: printLayers,
  };
};
