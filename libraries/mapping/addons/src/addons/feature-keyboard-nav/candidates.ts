import type { MapGeoJSONFeature } from "maplibre-gl";
import type { Geometry, Position } from "geojson";

import { stampSourceLayerFromProperty } from "@carma-mapping/utils";

import { bboxOfParts, isAreaGeometry, partsOfGeometry } from "./origin";
import { catalogLayerIdOfFeature } from "./scope";

/**
 * A navigable feature, as the addon keeps it between keypresses.
 *
 * Built once per map movement and then only read, which is the whole point:
 * every keypress is arithmetic on these, never another renderer query. The
 * renderer's query has three failure modes in this codebase — its symbol
 * feature index overflows on large vector tiles, it fails for fill-extrusion
 * layers under terrain, and it throws mid style-swap on stale layer ids — and
 * querying per keypress would put all three into the interaction, dozens of
 * times per key.
 */
export type NavCandidate = {
  /** `source | sourceLayer | id`, the identity a feature keeps across tiles */
  key: string;
  styleLayerId: string;
  catalogLayerId?: string;
  source: string;
  sourceLayer?: string;
  /** the feature as queried, handed to the app's selection path unchanged */
  feature: MapGeoJSONFeature;
  /**
   * Every piece of the feature that is on screen, as one geometry.
   *
   * `feature.geometry` is the share of the feature that sat in one tile: the
   * renderer clips at tile borders, so a street or a large parcel arrives as
   * several features with the same id. Whichever piece came first is not the
   * feature, and an interior point taken from a thin end piece lands on the
   * real feature's boundary. Ring grouping survives the merge, which is why
   * this is kept next to the flat `parts` rather than derived from it: a hole
   * has to stay a hole when the interior point is computed.
   */
  geometry: Geometry;
  /** every ring, line or point of the feature present in the viewport, in lng/lat */
  parts: Position[][];
  isArea: boolean;
  /** geographic bounding box, for the cheap per-keypress prune */
  bbox: [number, number, number, number];
};

/**
 * Two clipped pieces of one feature as a single geometry.
 *
 * Areas become a MultiPolygon whose parts are the pieces, so each piece keeps
 * its own outer ring and holes and an interior point can be computed over the
 * whole feature. Lines merge the same way. Mixed or unmergeable types keep the
 * piece already held, since a wrong merge would be worse than a partial one.
 */
/**
 * What makes a piece distinguishable from one already merged.
 *
 * The same feature comes back once per style layer that draws it — a fill and
 * an outline are two layers over one polygon — and those copies are identical
 * geometry, not further pieces of the feature. Merging them multiplies the work
 * of every interior point by the number of layers. First and last vertex plus
 * the ring shape identify a piece well enough: two genuinely different pieces
 * of one feature cannot share them.
 */
const pieceSignature = (geometry: Geometry): string | undefined => {
  const rings =
    geometry.type === "Polygon"
      ? geometry.coordinates
      : geometry.type === "MultiPolygon"
      ? geometry.coordinates.flat()
      : geometry.type === "LineString"
      ? [geometry.coordinates]
      : geometry.type === "MultiLineString"
      ? geometry.coordinates
      : undefined;
  const first = rings?.[0];
  if (!rings || !first || first.length === 0) return undefined;
  const start = first[0];
  const end = first[first.length - 1];
  return `${geometry.type}:${rings.length}:${first.length}:${start[0]},${start[1]}:${end[0]},${end[1]}`;
};

const mergeGeometries = (held: Geometry, incoming: Geometry): Geometry => {
  const asPolygons = (geometry: Geometry): Position[][][] | undefined =>
    geometry.type === "Polygon"
      ? [geometry.coordinates]
      : geometry.type === "MultiPolygon"
      ? geometry.coordinates
      : undefined;

  const heldPolygons = asPolygons(held);
  const incomingPolygons = asPolygons(incoming);
  if (heldPolygons && incomingPolygons) {
    return {
      type: "MultiPolygon",
      coordinates: [...heldPolygons, ...incomingPolygons],
    };
  }

  const asLines = (geometry: Geometry): Position[][] | undefined =>
    geometry.type === "LineString"
      ? [geometry.coordinates]
      : geometry.type === "MultiLineString"
      ? geometry.coordinates
      : undefined;

  const heldLines = asLines(held);
  const incomingLines = asLines(incoming);
  if (heldLines && incomingLines) {
    return {
      type: "MultiLineString",
      coordinates: [...heldLines, ...incomingLines],
    };
  }

  return held;
};

export const candidateKeyOf = (feature: {
  source?: string;
  sourceLayer?: string;
  id?: string | number;
}): string | undefined =>
  feature.id === undefined || feature.id === null || !feature.source
    ? undefined
    : `${feature.source}|${feature.sourceLayer ?? ""}|${String(feature.id)}`;

export type CandidateSet = {
  candidates: NavCandidate[];
  byKey: Map<string, NavCandidate>;
  /** the query hit its bound, or failed, so the set is not the whole truth */
  degraded: boolean;
};

export const EMPTY_CANDIDATE_SET: CandidateSet = {
  candidates: [],
  byKey: new Map(),
  degraded: false,
};

/**
 * Queried features to candidates: deduplicated on `source | sourceLayer | id`,
 * with the parts of one feature split across several tiles merged into a single
 * candidate rather than the first tile's share of it.
 *
 * Features without an id are dropped. They cannot be deduplicated across tiles
 * and cannot be addressed by the application's selection path, so navigating to
 * one would select nothing.
 */
export const buildCandidates = (
  features: MapGeoJSONFeature[],
  {
    catalogLayerIds,
    requireCatalogLayer = false,
    maxCandidates,
  }: {
    catalogLayerIds?: string[];
    requireCatalogLayer?: boolean;
    maxCandidates: number;
  }
): CandidateSet => {
  const allowed = catalogLayerIds ? new Set(catalogLayerIds) : undefined;
  const byKey = new Map<string, NavCandidate>();
  /** pieces already merged per candidate, so layer duplicates are merged once */
  const piecesByKey = new Map<string, Set<string>>();
  let truncated = false;

  for (const feature of features) {
    stampSourceLayerFromProperty(feature);
    const key = candidateKeyOf(feature);
    if (!key) continue;

    const catalogLayerId = catalogLayerIdOfFeature(feature);
    // the style-layer filter of the query already narrows this; re-checked so a
    // layer added outside the composer cannot leak into a scoped navigation
    if (allowed && (!catalogLayerId || !allowed.has(catalogLayerId))) continue;
    // the basemap draws vector features too, and they are not navigable
    if (requireCatalogLayer && !catalogLayerId) continue;

    const parts = partsOfGeometry(feature.geometry);
    if (parts.length === 0) continue;

    const signature = pieceSignature(feature.geometry);

    const existing = byKey.get(key);
    if (existing) {
      const seen = piecesByKey.get(key);
      // the same geometry again, from a second style layer over the same
      // feature: nothing to merge, and merging it would multiply the work of
      // every interior point by the number of layers that draw the feature
      if (signature !== undefined && seen?.has(signature)) continue;
      if (signature !== undefined) seen?.add(signature);

      existing.parts.push(...parts);
      existing.geometry = mergeGeometries(existing.geometry, feature.geometry);
      const bbox = bboxOfParts(existing.parts);
      if (bbox) existing.bbox = bbox;
      continue;
    }

    if (byKey.size >= maxCandidates) {
      truncated = true;
      continue;
    }

    const bbox = bboxOfParts(parts);
    if (!bbox) continue;

    piecesByKey.set(
      key,
      new Set(signature === undefined ? [] : [signature])
    );
    byKey.set(key, {
      key,
      styleLayerId: feature.layer?.id ?? "",
      ...(catalogLayerId ? { catalogLayerId } : {}),
      source: feature.source,
      ...(feature.sourceLayer ? { sourceLayer: feature.sourceLayer } : {}),
      feature,
      geometry: feature.geometry,
      parts,
      isArea: isAreaGeometry(feature.geometry.type),
      bbox,
    });
  }

  return {
    candidates: [...byKey.values()],
    byKey,
    degraded: truncated,
  };
};
