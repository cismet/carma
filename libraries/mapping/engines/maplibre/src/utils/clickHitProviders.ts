import type { MapGeoJSONFeature, Map as MaplibreMap, Point } from "maplibre-gl";

/**
 * Hits a click stands for, supplied by an addon instead of the map's own query.
 *
 * Something drawn outside MapLibre's layers (a three.js model, say) covers
 * pixels where MapLibre's query finds nothing, or finds whatever lies on the
 * ground behind it. An addon that knows which map feature such a drawing
 * represents registers a provider; the engine's click listener asks the
 * providers first and, when one answers, runs its ordinary 2D selection on the
 * hits it got, so the info box and the feature-state highlight follow exactly
 * as for a click on the feature itself. Unlike `claimClick`, the click is not
 * taken away from the engine, only pointed at a different feature.
 *
 * Kept on the map rather than in a module-level map, so a map that goes away
 * takes its providers with it.
 */
export type ClickHitProvider = (point: Point) => MapGeoJSONFeature[] | null;

const PROVIDERS_KEY = "__carmaClickHitProviders";

const providersOf = (map: MaplibreMap): Set<ClickHitProvider> => {
  const existing = (map as unknown as Record<string, unknown>)[
    PROVIDERS_KEY
  ] as Set<ClickHitProvider> | undefined;
  if (existing) {
    return existing;
  }
  const created = new Set<ClickHitProvider>();
  (map as unknown as Record<string, unknown>)[PROVIDERS_KEY] = created;
  return created;
};

/** Add a provider; the returned function takes it off again. */
export const registerClickHitProvider = (
  map: MaplibreMap,
  provider: ClickHitProvider
): (() => void) => {
  providersOf(map).add(provider);
  return () => {
    providersOf(map).delete(provider);
  };
};

/** The first provider's non-empty answer, or null when none has one. */
export const resolveProvidedClickHits = (
  map: MaplibreMap,
  point: Point
): MapGeoJSONFeature[] | null => {
  for (const provider of providersOf(map)) {
    const hits = provider(point);
    if (hits && hits.length > 0) {
      return hits;
    }
  }
  return null;
};
