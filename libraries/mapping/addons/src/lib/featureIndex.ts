import type { Map as MaplibreMap } from "maplibre-gl";

import {
  // finding the file: which sources the layer stack has, where each one's
  // tileset lives, and how the host rewrites a URL before fetching it
  resolveStackedSources,
  resolveTileTemplates,
  tileSetBaseUrl,
  transformUrl,
  type StackedSource,
} from "./stackedSources";

/**
 * Ranking against the tileset's own `features.json`, the per-layer feature
 * index the tiling pipeline writes next to `metadata.json`.
 *
 * The obvious alternative, reading the tiles themselves, was tried and dropped:
 * either the whole tileset for a small source, or a square around the click for
 * a big one. Both cost real traffic, the second one is only ever locally
 * correct, and neither can be complete for a source like ALKIS, whose low-zoom
 * tiles are tens of megabytes each.
 *
 * `features.json` is that data set reduced to what ranking actually needs: one
 * id, one source-layer and one bounding box per feature, about 25 bytes each.
 * The whole thing is fetched once, is complete by construction, and every click
 * afterwards is a linear scan over two typed arrays with no requests at all.
 *
 * ```json
 * {
 *   "version": 1,
 *   "quantization": 1000000,
 *   "origin": [6998235, 51137982],
 *   "layers": ["apotheken"],
 *   "ids": [16, 17, ...],
 *   "layerIndex": [0, 0, ...],
 *   "bbox": [205257, 88915, 0, 0, ...]
 * }
 * ```
 *
 * `bbox` holds four integers per feature: `minX`, `minY`, `width`, `height`,
 * quantized by `quantization` and offset from `origin`, which is the corner of
 * the layer's own extent. A point is a zero-sized box. 1e-6 degrees is about
 * 10 cm, far below anything a distance ranking cares about.
 *
 * What the index does *not* carry is properties or geometry. Ranking needs
 * neither: a box gives an exact answer for points and a lower bound for
 * everything else, and "inside the box" is what a click on a parcel needs. So
 * this module issues exactly one request per tileset, ever, and none per click.
 *
 * A hit therefore has an id but no attributes. The `ids` are the ids tippecanoe
 * stamped onto the tile features, so they join back to the tiles and are what
 * selection is keyed on; showing a feature's attributes needs the pipeline to
 * write properties into `features.json`, see `docs/features-json-generic.md`.
 *
 * Tiles the *map* fetches to draw itself are a separate matter and unaffected:
 * nothing here can or should stop MapLibre rendering the layer.
 *
 * A source without a `features.json` is skipped rather than substituted, and
 * reported in `statuses`, so "this layer has no index yet" stays visible
 * instead of being papered over with a worse answer.
 */

/** the file as it is served, before decoding */
type FeatureIndexDocument = {
  version?: number;
  quantization?: number;
  origin?: number[];
  layers?: unknown[];
  ids?: unknown[];
  layerIndex?: number[];
  bbox?: number[];
};

/** one layer's index, decoded into flat arrays that survive half a million rows */
export type FeatureIndex = {
  /** source-layer names; `layerIndex[i]` points into this */
  layers: string[];
  /** feature ids, matching the ids on the tile features */
  ids: (string | number)[];
  layerIndex: Uint16Array;
  /** `minX, minY, width, height` per feature, quantized and origin-relative */
  bbox: Int32Array;
  quantization: number;
  originX: number;
  originY: number;
  count: number;
  /** what the file weighed, for the load log */
  bytes: number;
};

/** one ranked hit; the field names are the ones the addon's panel reads */
export type IndexedFeatureEntry = {
  distanceInMeters: number;
  /** the layer-stack entry, from the style layer's `metadata["layer-id"]` stamp */
  layerId: string;
  sourceId: string;
  sourceLayer: string;
  id: string | number;
  /** `[west, south, east, north]`, decoded to degrees */
  bbox: [number, number, number, number];
};

/** why a source contributed nothing, so a surprising result is explainable */
export type FeatureIndexStatus = {
  sourceId: string;
  layerId: string;
  /** number of features the index holds, or `null` when there is no index */
  featureCount: number | null;
};

export type NearestFromIndexResult = {
  entries: IndexedFeatureEntry[];
  /** one row per source of the layer stack, indexed or not */
  statuses: FeatureIndexStatus[];
};

export type NearestFromIndexOptions = {
  lng: number;
  lat: number;
  /** how many hits to return. Default: 5 */
  count?: number;
};

const DEFAULT_COUNT = 5;

/* -------------------------------------------------------------------------- */
/* loading                                                                    */
/* -------------------------------------------------------------------------- */

const isNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "number");

/**
 * Decode the served document into flat arrays. Typed arrays for the two big
 * columns: at ALKIS scale `bbox` is two million numbers, and an `Int32Array`
 * holds them in 8 MB where a JS array of boxed numbers would take several times
 * that. `ids` stays a plain array because the pipeline may write strings there.
 *
 * Returns `null` for anything that is not a version 1 index, including an
 * `index.html` a misconfigured server answers a missing file with.
 */
const decodeIndex = (
  document: FeatureIndexDocument,
  bytes: number
): FeatureIndex | null => {
  if (document?.version !== 1) {
    return null;
  }
  const { ids, layerIndex, bbox, origin } = document;
  if (!Array.isArray(ids) || !isNumberArray(layerIndex) || !isNumberArray(bbox)) {
    return null;
  }
  const count = ids.length;
  if (layerIndex.length !== count || bbox.length !== count * 4) {
    return null;
  }
  const quantization = document.quantization;
  if (typeof quantization !== "number" || quantization <= 0) {
    return null;
  }
  return {
    layers: (document.layers ?? []).map(String),
    ids: ids as (string | number)[],
    layerIndex: Uint16Array.from(layerIndex),
    bbox: Int32Array.from(bbox),
    quantization,
    originX: origin?.[0] ?? 0,
    originY: origin?.[1] ?? 0,
    count,
    bytes,
  };
};

/**
 * One index per tileset directory, kept for the session and keyed by that
 * directory rather than by source id: the id is namespaced per stack entry and
 * changes with the style, the directory identifies the data. A `null` result is
 * cached too, so a source without an index is asked for one exactly once.
 */
const indexStore = new Map<string, Promise<FeatureIndex | null>>();

const fetchFeatureIndex = (baseUrl: string): Promise<FeatureIndex | null> => {
  const cached = indexStore.get(baseUrl);
  if (cached) {
    return cached;
  }
  const url = `${baseUrl}features.json`;
  const pending = fetch(url)
    .then(async (response) => {
      if (!response.ok) {
        return null;
      }
      // read as text first, so the byte size is known and a non-JSON answer
      // (an error page served with a 200) fails here rather than mid-decode
      const body = await response.text();
      let document: FeatureIndexDocument;
      try {
        document = JSON.parse(body) as FeatureIndexDocument;
      } catch {
        return null;
      }
      const index = decodeIndex(document, body.length);
      if (index) {
        console.debug(
          `[NEAREST FEATURE INDEX] ${url}: ${index.count} features, ` +
            `${(index.bytes / 1024).toFixed(0)} KB, layers ` +
            index.layers.join(", ")
        );
      }
      return index;
    })
    .catch(() => null);
  indexStore.set(baseUrl, pending);
  return pending;
};

/** the index of one stacked source, or `null` when the tileset publishes none */
const indexForSource = async (
  map: MaplibreMap,
  source: StackedSource
): Promise<FeatureIndex | null> => {
  if (source.type !== "vector") {
    return null;
  }
  const templates = await resolveTileTemplates(map, source.sourceId);
  const base = templates ? tileSetBaseUrl(templates[0]) : null;
  if (!base) {
    return null;
  }
  return fetchFeatureIndex(transformUrl(map, base, "Source"));
};

/* -------------------------------------------------------------------------- */
/* ranking                                                                    */
/* -------------------------------------------------------------------------- */

/** turf's mean earth radius, so distances match what the rest of the app shows */
const EARTH_RADIUS_METERS = 6371008.8;
const DEGREE = Math.PI / 180;

/**
 * Meters per degree at one latitude: the plane tangent to turf's sphere at the
 * click. Measuring a great circle per feature would mean four trigonometric
 * calls for every one of half a million rows on every click, so the ranking
 * flattens the neighbourhood instead.
 *
 * Taking the *sphere's* scale rather than the ellipsoid's is deliberate: it is
 * the radius `@turf/distance` measures on, which is what every other distance
 * in the app is computed with. Measured against turf on the apotheken layer:
 * agreement to a millimetre inside 500 m, under 10 m at 15 km, same order.
 */
const degreeScale = (lat: number): { perLng: number; perLat: number } => ({
  perLat: EARTH_RADIUS_METERS * DEGREE,
  perLng: EARTH_RADIUS_METERS * DEGREE * Math.cos(lat * DEGREE),
});

const clamp = (value: number, low: number, high: number) =>
  value < low ? low : value > high ? high : value;

/**
 * Keep the `count` smallest, by insertion into an already sorted short list.
 * `count` is a handful, so this is cheaper than sorting the whole scan and it
 * never allocates per row.
 */
const insertRanked = <T extends { distanceInMeters: number }>(
  ranked: T[],
  candidate: T,
  count: number
): void => {
  if (ranked.length === count && candidate.distanceInMeters >= ranked[count - 1].distanceInMeters) {
    return;
  }
  let position = ranked.length;
  while (
    position > 0 &&
    ranked[position - 1].distanceInMeters > candidate.distanceInMeters
  ) {
    position--;
  }
  ranked.splice(position, 0, candidate);
  if (ranked.length > count) {
    ranked.pop();
  }
};

/**
 * The `count` features of one index closest to the click, by distance to their
 * bounding box: zero when the click is inside the box, the distance to its
 * nearest edge or corner otherwise.
 *
 * For a point layer that is the exact answer. For lines and polygons it is a
 * lower bound on the true distance, because a box is at least as close as the
 * geometry it encloses; the ranking can therefore put a feature slightly too
 * high, never too low, and a click *inside* a parcel still scores 0 and wins.
 */
const rankIndex = (
  index: FeatureIndex,
  source: StackedSource,
  lng: number,
  lat: number,
  count: number
): IndexedFeatureEntry[] => {
  const { perLng, perLat } = degreeScale(lat);
  const { bbox, quantization, originX, originY, layerIndex, layers, ids } =
    index;
  // empty means "every source-layer the tileset has"
  const wanted = source.sourceLayers;
  const ranked: IndexedFeatureEntry[] = [];

  for (let i = 0; i < index.count; i++) {
    const sourceLayer = layers[layerIndex[i]] ?? "";
    if (wanted.length > 0 && !wanted.includes(sourceLayer)) {
      continue;
    }
    const offset = i * 4;
    const west = (originX + bbox[offset]) / quantization;
    const south = (originY + bbox[offset + 1]) / quantization;
    const east = west + bbox[offset + 2] / quantization;
    const north = south + bbox[offset + 3] / quantization;

    const dx = (clamp(lng, west, east) - lng) * perLng;
    const dy = (clamp(lat, south, north) - lat) * perLat;
    const distanceInMeters = Math.sqrt(dx * dx + dy * dy);

    insertRanked(
      ranked,
      {
        distanceInMeters: Math.round(distanceInMeters * 100) / 100,
        layerId: source.catalogLayerId,
        sourceId: source.sourceId,
        sourceLayer,
        id: ids[i],
        bbox: [west, south, east, north],
      },
      count
    );
  }
  return ranked;
};

/* -------------------------------------------------------------------------- */
/* public                                                                     */
/* -------------------------------------------------------------------------- */

/** the last primed set of source ids per map, so `styledata` stays cheap */
const primedSignatures = new WeakMap<MaplibreMap, string>();

/**
 * Start fetching the index of every stacked source that has not been asked for
 * yet, and return without waiting. Call this when the style changes: by the
 * time the user clicks, the file is there and the ranking costs no requests.
 * Repeated calls with an unchanged set of sources do nothing.
 */
export const primeFeatureIndexes = (map: MaplibreMap): void => {
  const sources = resolveStackedSources(map);
  const signature = sources
    .map((source) => source.sourceId)
    .sort()
    .join("|");
  if (primedSignatures.get(map) === signature) {
    return;
  }
  primedSignatures.set(map, signature);
  for (const source of sources) {
    void indexForSource(map, source).catch(() => undefined);
  }
};

/**
 * The features of the map's layer stack closest to a point, ranked from the
 * tilesets' `features.json` files alone.
 *
 * Complete over each indexed source, independent of camera, zoom and layer
 * visibility, and free of requests once the indexes are loaded. Sources whose
 * tileset publishes no index contribute nothing and are reported in `statuses`,
 * so a caller can tell "nothing is near" from "this layer has no index yet".
 */
export const collectNearestFromIndex = async (
  map: MaplibreMap,
  options: NearestFromIndexOptions
): Promise<NearestFromIndexResult> => {
  const { lng, lat } = options;
  const count = options.count ?? DEFAULT_COUNT;
  const sources = resolveStackedSources(map);

  const perSource = await Promise.all(
    sources.map(async (source) => {
      const index = await indexForSource(map, source);
      return {
        status: {
          sourceId: source.sourceId,
          layerId: source.catalogLayerId,
          featureCount: index?.count ?? null,
        },
        entries: index ? rankIndex(index, source, lng, lat, count) : [],
      };
    })
  );

  // each source ranked its own best `count`; merging them and cutting again is
  // what makes the result the best `count` across the whole stack
  const merged: IndexedFeatureEntry[] = [];
  for (const { entries } of perSource) {
    for (const entry of entries) {
      insertRanked(merged, entry, count);
    }
  }

  return { entries: merged, statuses: perSource.map((one) => one.status) };
};
