import type { Map as MaplibreMap } from "maplibre-gl";

/**
 * Finding the map's own data: which sources the layer stack has, where each
 * one's tile set lives, and how the host rewrites a URL before fetching it.
 *
 * Everything here is about *addressing* a tile set, not about reading it.
 * `featureIndex` asks these questions about a tileset's `features.json`, which
 * sits next to the tiles in the same directory tippecanoe wrote; the tiles
 * themselves are MapLibre's business and are never fetched from here.
 */

/** one source of the layer stack, with the source-layers its style layers use */
export type StackedSource = {
  sourceId: string;
  catalogLayerId: string;
  /**
   * The catalog id the layer apis speak (`carma.mapping2D.hasLayer` and
   * friends), from the `metadata["carma-layer-id"]` stamp. `catalogLayerId` is
   * the slugified style URL instead, so it cannot be matched against a config.
   * Undefined for layers a style added without one.
   */
  carmaLayerId?: string;
  /**
   * source-layers referenced by the stack's style layers. Empty means "take
   * every layer the tile holds", which is what a vector source whose style
   * layer omits `source-layer` implies.
   */
  sourceLayers: string[];
  type: "vector" | "geojson";
};

/**
 * The source/source-layer pairs behind the style layers that belong to the
 * map's layer stack. Layers added outside `styleComposer` (debug overlays,
 * drawing tools, a click marker) carry no `metadata["layer-id"]` stamp and are
 * excluded; raster sources hold no queryable features and are skipped. Sources
 * are namespaced per stack entry, so each source maps to one catalog layer.
 */
export const resolveStackedSources = (map: MaplibreMap): StackedSource[] => {
  const sources = new Map<string, StackedSource>();
  for (const layer of map.getStyle()?.layers ?? []) {
    const metadata = (layer as { metadata?: Record<string, unknown> }).metadata;
    const stamped = metadata?.["layer-id"];
    if (typeof stamped !== "string" || stamped === "") {
      continue;
    }
    if (!("source" in layer) || typeof layer.source !== "string") {
      continue;
    }
    const type = map.getSource(layer.source)?.type;
    if (type !== "vector" && type !== "geojson") {
      continue;
    }
    const carmaLayerId = metadata?.["carma-layer-id"];
    const existing = sources.get(layer.source);
    const entry = existing ?? {
      sourceId: layer.source,
      catalogLayerId: stamped,
      ...(typeof carmaLayerId === "string" && carmaLayerId !== ""
        ? { carmaLayerId }
        : {}),
      sourceLayers: [],
      type,
    };
    const sourceLayer =
      "source-layer" in layer ? layer["source-layer"] : undefined;
    if (
      typeof sourceLayer === "string" &&
      !entry.sourceLayers.includes(sourceLayer)
    ) {
      entry.sourceLayers.push(sourceLayer);
    }
    if (!existing) {
      sources.set(layer.source, entry);
    }
  }
  return [...sources.values()];
};

/**
 * The ids of the style layers drawing one source, which is what
 * `queryRenderedFeatures` wants when it should only look at that layer. Passing
 * ids the style no longer has throws there, so this is read fresh per query.
 */
export const styleLayerIdsForSource = (
  map: MaplibreMap,
  sourceId: string
): string[] =>
  (map.getStyle()?.layers ?? [])
    .filter((layer) => "source" in layer && layer.source === sourceId)
    .map((layer) => layer.id);

/**
 * Run a URL through the map's request transform, so a source that needs an API
 * key, a proxy prefix or a rewritten host is fetched the same way MapLibre
 * fetches it. The request manager is internal, hence the guarded access: a
 * MapLibre without it just leaves the URL alone.
 */
export const transformUrl = (
  map: MaplibreMap,
  url: string,
  kind: "Tile" | "Source"
): string => {
  const manager = (
    map as unknown as {
      _requestManager?: {
        transformRequest?: (u: string, k: string) => { url?: string } | null;
      };
    }
  )._requestManager;
  try {
    return manager?.transformRequest?.(url, kind)?.url ?? url;
  } catch {
    return url;
  }
};

/**
 * The tile set's base URL, i.e. the template up to its first placeholder. That
 * is the directory tippecanoe wrote, and where its `features.json` sits.
 */
export const tileSetBaseUrl = (template: string): string | null => {
  const placeholder = template.indexOf("{");
  if (placeholder < 1) {
    return null;
  }
  const base = template.slice(0, placeholder);
  return base.endsWith("/")
    ? base
    : `${base.slice(0, base.lastIndexOf("/") + 1)}`;
};

/** TileJSON documents, keyed by their URL */
const tileJsonCache = new Map<string, Promise<string[] | null>>();

const fetchTileTemplates = (url: string): Promise<string[] | null> => {
  const cached = tileJsonCache.get(url);
  if (cached) {
    return cached;
  }
  const pending = fetch(url)
    .then((response) => (response.ok ? response.json() : null))
    .then((tileJson: Record<string, unknown> | null) => {
      const tiles = tileJson?.["tiles"];
      if (!Array.isArray(tiles)) {
        return null;
      }
      const templates = tiles.filter(
        (tile): tile is string => typeof tile === "string"
      );
      return templates.length > 0 ? templates : null;
    })
    .catch(() => null);
  tileJsonCache.set(url, pending);
  return pending;
};

/**
 * The `{z}/{x}/{y}` templates a vector source serves its tiles from, which is
 * what says where its tile set directory is. Read off the live source object
 * rather than the serialized style: a source declared by TileJSON `url` only
 * gets its `tiles` array once the document has loaded, and the serialized form
 * still shows the `url`.
 */
export const resolveTileTemplates = async (
  map: MaplibreMap,
  sourceId: string
): Promise<string[] | null> => {
  const source = map.getSource(sourceId) as
    | { tiles?: string[]; url?: string }
    | undefined;
  if (!source) {
    return null;
  }
  if (Array.isArray(source.tiles) && source.tiles.length > 0) {
    return source.tiles;
  }
  // only plain http(s) TileJSON is resolvable here; `pmtiles://` and friends
  // are served by a protocol handler we cannot replay with a bare fetch
  if (typeof source.url === "string" && /^https?:\/\//.test(source.url)) {
    return fetchTileTemplates(transformUrl(map, source.url, "Source"));
  }
  return null;
};
