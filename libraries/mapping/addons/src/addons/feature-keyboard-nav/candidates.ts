import type { MapGeoJSONFeature } from "maplibre-gl";
import type { Position } from "geojson";

import { stampSourceLayerFromProperty } from "@carma-mapping/utils";

import {
  bboxOfParts,
  interiorPointOf,
  isAreaGeometry,
  partsOfGeometry,
} from "./origin";
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
  /** every ring, line or point of the feature present in the viewport, in lng/lat */
  parts: Position[][];
  isArea: boolean;
  /** geographic bounding box, for the cheap per-keypress prune */
  bbox: [number, number, number, number];
  /**
   * The interior point this feature would measure from if it were selected —
   * the same `pointOnFeature` the origin uses. Only filled while the explain
   * overlay asks for it, since navigation itself needs the origin of exactly
   * one feature and computing it for every visible one is wasted work.
   */
  origin?: [number, number];
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
    originsUpTo = 0,
  }: {
    catalogLayerIds?: string[];
    requireCatalogLayer?: boolean;
    maxCandidates: number;
    /** compute `origin` for at most this many candidates; 0 for none */
    originsUpTo?: number;
  }
): CandidateSet => {
  const allowed = catalogLayerIds ? new Set(catalogLayerIds) : undefined;
  const byKey = new Map<string, NavCandidate>();
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

    const existing = byKey.get(key);
    if (existing) {
      existing.parts.push(...parts);
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

    byKey.set(key, {
      key,
      styleLayerId: feature.layer?.id ?? "",
      ...(catalogLayerId ? { catalogLayerId } : {}),
      source: feature.source,
      ...(feature.sourceLayer ? { sourceLayer: feature.sourceLayer } : {}),
      feature,
      parts,
      isArea: isAreaGeometry(feature.geometry.type),
      bbox,
    });
  }

  const candidates = [...byKey.values()];

  // after the merge, so a feature split across tiles gets the origin of the
  // geometry that is actually handed to the selection path. Bounded: this is a
  // drawing aid, and `pointOnFeature` per visible feature adds up.
  for (
    let index = 0;
    index < Math.min(originsUpTo, candidates.length);
    index++
  ) {
    const origin = interiorPointOf(candidates[index].feature.geometry);
    if (origin) candidates[index].origin = origin;
  }

  return {
    candidates,
    byKey,
    degraded: truncated,
  };
};
