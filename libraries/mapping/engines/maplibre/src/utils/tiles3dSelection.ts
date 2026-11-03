import type maplibregl from "maplibre-gl";

import type { Tiles3dRaycastResult } from "../lib/runtime/integrations/three-tiles-runtime-types";

// ─────────────────────────────────────────────────────────────
//  Turning a 3D Tiles hit into something the info box path can read.
//
//  Every other layer answers a click with a vector feature, and the whole
//  selection path in LibreMap is written around one: it needs a source, a
//  source-layer, a feature id to put the `selected` state on, a geometry and a
//  properties bag. A tileset has none of that. Its hit resolves against the
//  glTF property table inside the tile, which is exactly why it can be clicked
//  with no vector source loaded at all.
//
//  So the hit is dressed as a vector feature here, and the path downstream
//  runs unchanged. Two routes, both taken when they are available:
//
//  - standalone, out of the property table alone, which is all a tileset on
//    its own can offer and is enough for an info box;
//  - forwarded to the vector rung of the same data when that layer is on, so
//    the flat footprint takes the `selected` state and highlights along with
//    the solid, and its richer attributes reach the mapping function as
//    `targetProperties`, the same shape the ALKIS label routing uses.
// ─────────────────────────────────────────────────────────────

/**
 * What a tileset's `carmaConf["3d"]` says about the vector rung of the same
 * data. Absent, only the standalone route runs.
 */
export interface Tiles3dFeatureSource {
  /**
   * The source id as the vector style names it, before the style merge
   * namespaces it. See `resolveMergedSourceId` for why the raw name is what a
   * style can honestly write down.
   */
  source: string;
  /** The source-layer inside it that carries the buildings. */
  sourceLayer?: string;
  /**
   * The property both rungs carry the building identity in. A property, never
   * a feature id: the vector rung's feature id is per geometry, per part for
   * footprints and per face for roofs, and one building is many of those.
   */
  idProperty: string;
}

/** A tileset hit in the shape the selection path reads. */
export interface SynthesizedTiles3dFeature {
  /** The vector twin's source, or "" when that rung is not loaded. */
  source: string;
  sourceLayer?: string;
  id?: string | number;
  geometry: GeoJSON.Geometry;
  /**
   * The property table rows, plus `targetProperties` holding the vector twin's
   * attributes where there is one.
   */
  properties: Record<string, unknown>;
  /** carmaConf of the style layer that declared the tileset. */
  carmaConf?: Record<string, unknown>;
  /** Its `layer-id`, which is the key the info box mapping is filed under. */
  layerId?: string;
  /**
   * Every feature id the vector twin answered with. A building split into
   * parts is several features there and each is a separate `selected` state,
   * so highlighting only the first would light up one wing of a courtyard.
   */
  twinIds: Array<string | number>;
}

/**
 * The property table rows the hit resolved to, as one flat object.
 *
 * Set 0 is the building; set 1, where the hit primitive declares one, is the
 * roof face under the cursor. Roofs carry both, walls carry set 0 alone. The
 * two tables share no field name, so a click can hand the info box the
 * building and the face it landed on at once.
 */
function tileProperties(
  result: Tiles3dRaycastResult
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const feature of result.features) {
    if (feature.properties) Object.assign(merged, feature.properties);
  }
  return merged;
}

/**
 * The style layer that declared this tileset.
 *
 * `getCarmaConfFromStyle` cannot answer this: it keys on source-layer, and the
 * layer a tileset hangs on is a `background` with neither a source nor a
 * source-layer. It exists only to carry the configuration through the style
 * merge, which keeps layers and sources and drops everything else. The way
 * back to it is the tileset URL.
 */
function findTiles3dStyleLayer(
  map: maplibregl.Map,
  tilesetUrl: string
): { carmaConf?: Record<string, unknown>; layerId?: string } | undefined {
  for (const layer of map.getStyle()?.layers ?? []) {
    const metadata = (layer as { metadata?: Record<string, unknown> }).metadata;
    const carmaConf = metadata?.carmaConf as
      | Record<string, unknown>
      | undefined;
    const conf = carmaConf?.["3d"] as { tilesetUrl?: string } | undefined;
    if (conf?.tilesetUrl === tilesetUrl) {
      return {
        carmaConf,
        layerId: metadata?.["layer-id"] as string | undefined,
      };
    }
  }
  return undefined;
}

/**
 * The id the vector rung's source ends up with on the map.
 *
 * The style merge namespaces every source of a vector style as
 * `<host layer id>::<source id>`, and that host layer id belongs to the vector
 * rung, not to the tileset, so the tileset's style cannot know it and must not
 * try to write it down. The declared name survives as the suffix, which is
 * what both ends can agree on.
 */
function resolveMergedSourceId(
  map: maplibregl.Map,
  declared: string
): string | undefined {
  const sources = map.getStyle()?.sources ?? {};
  if (declared in sources) return declared;
  const suffix = `::${declared}`;
  return Object.keys(sources).find((id) => id.endsWith(suffix));
}

/**
 * Dress a tileset hit as the vector feature the selection path expects.
 *
 * Never returns null for a hit that resolved a property table row: without a
 * vector twin the standalone route still carries an info box. The twin is
 * looked up only when the style names one and that source is actually on the
 * map with the building in a loaded tile.
 */
export function synthesizeTiles3dSourceFeature(
  map: maplibregl.Map,
  tilesetUrl: string,
  result: Tiles3dRaycastResult,
  clickedAt: { lng: number; lat: number }
): SynthesizedTiles3dFeature {
  const properties = tileProperties(result);
  const declaring = findTiles3dStyleLayer(map, tilesetUrl);

  const standalone: SynthesizedTiles3dFeature = {
    source: "",
    geometry: {
      type: "Point",
      coordinates: [clickedAt.lng, clickedAt.lat],
    },
    properties,
    carmaConf: declaring?.carmaConf,
    layerId: declaring?.layerId,
    twinIds: [],
  };

  const featureSource = (
    declaring?.carmaConf?.["3d"] as
      | { featureSource?: Tiles3dFeatureSource }
      | undefined
  )?.featureSource;
  if (!featureSource?.source || !featureSource.idProperty) return standalone;

  const identity = properties[featureSource.idProperty];
  if (identity == null || identity === "") return standalone;

  const source = resolveMergedSourceId(map, featureSource.source);
  if (!source) return standalone;

  let twins: maplibregl.GeoJSONFeature[];
  try {
    twins = map.querySourceFeatures(source, {
      sourceLayer: featureSource.sourceLayer,
      filter: [
        "==",
        ["get", featureSource.idProperty],
        identity as string | number,
      ],
    });
  } catch {
    // The source can be present in the style and not yet queryable, and a
    // missing twin is never a reason to lose the info box.
    return standalone;
  }
  if (twins.length === 0) return standalone;

  const twinIds: Array<string | number> = [];
  for (const twin of twins) {
    if (twin.id != null && !twinIds.includes(twin.id)) twinIds.push(twin.id);
  }

  return {
    ...standalone,
    source,
    sourceLayer: featureSource.sourceLayer,
    id: twins[0].id,
    // The footprint, so the click zooms to the whole building rather than to
    // the point the cursor happened to land on.
    geometry: twins[0].geometry ?? standalone.geometry,
    // The tile's own row stays the feature's properties; the twin's go where
    // the ALKIS label routing puts them, so one mapping function reads
    // `p.targetProperties` for the vector attributes whether the click came
    // from a label, a footprint or a solid.
    properties: {
      ...properties,
      targetProperties: { ...twins[0].properties },
    },
    twinIds,
  };
}
