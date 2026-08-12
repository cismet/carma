import type { MapGeoJSONFeature } from "maplibre-gl";
import type { Position } from "geojson";

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
  /** every ring, line or point of the feature present in the viewport, in lng/lat */
  parts: Position[][];
  isArea: boolean;
  /** geographic bounding box, for the cheap per-keypress prune */
  bbox: [number, number, number, number];
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

  return {
    candidates: [...byKey.values()],
    byKey,
    degraded: truncated,
  };
};
