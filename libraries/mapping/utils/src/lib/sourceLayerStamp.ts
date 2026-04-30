/**
 * Stamp `feature.sourceLayer` from `properties._sourceLayer` when missing.
 *
 * GeoJSON features (returned from `queryRenderedFeatures` / `querySourceFeatures`
 * over a geojson source) carry no native `sourceLayer`. The convention for
 * FCs that mirror a vector-tile schema (e.g. the brandnew FC) is to put the
 * equivalent in `properties._sourceLayer`. This helper makes downstream code
 * that reads `feature.sourceLayer` — selection wiring, sidebar lookups,
 * grouping, etc. — work uniformly for vector and geojson features.
 *
 * Mutates the feature in place. No-op if `sourceLayer` is already set or if
 * `properties._sourceLayer` is missing/empty.
 */
export function stampSourceLayerFromProperty(feature: {
  sourceLayer?: string;
  properties?: Record<string, unknown> | null;
}): void {
  if (feature.sourceLayer) return;
  const sl = (feature.properties as Record<string, unknown> | undefined)?.[
    "_sourceLayer"
  ];
  if (typeof sl === "string" && sl.length > 0) {
    (feature as { sourceLayer: string }).sourceLayer = sl;
  }
}
