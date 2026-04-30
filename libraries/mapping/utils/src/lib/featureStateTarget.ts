import type { Map as MaplibreMap } from "maplibre-gl";

export interface FeatureStateRef {
  source: string;
  sourceLayer?: string;
  /** May be undefined; callers are expected to guard before calling, the
   *  helper just preserves it. */
  id?: string | number;
}

/**
 * Build a setFeatureState / getFeatureState target.
 *
 * MapLibre logs an error and refuses the call when a `sourceLayer` parameter
 * is supplied for a geojson source. Vector tile sources in turn require it.
 * This helper inspects the source type at call time and emits the right
 * shape for each.
 */
export function buildFeatureStateTarget(
  map: MaplibreMap,
  ref: FeatureStateRef
): { source: string; sourceLayer?: string; id: string | number } {
  const isGeojson = map.getSource(ref.source)?.type === "geojson";
  if (!isGeojson && ref.sourceLayer) {
    return {
      source: ref.source,
      sourceLayer: ref.sourceLayer,
      id: ref.id as string | number,
    };
  }
  return { source: ref.source, id: ref.id as string | number };
}
