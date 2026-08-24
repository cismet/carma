import type { Map as MaplibreMap, MapGeoJSONFeature } from "maplibre-gl";

import type { IndexedFeatureEntry } from "../../lib/featureIndex";
import { styleLayerIdsForSource } from "../../lib/stackedSources";

/**
 * Where a hit's name comes from. `features.json` carries an id, a source-layer
 * and a bounding box and no properties at all, so the attributes are read back
 * off the features MapLibre has drawn, which is why the map is fitted to all
 * hits before this runs.
 */

/** identity of a ranked hit, and of a drawn feature, in the same string */
export const featureKey = (entry: {
  sourceId: string;
  sourceLayer?: string;
  id: string | number;
}) => `${entry.sourceId}::${entry.sourceLayer ?? ""}::${String(entry.id)}`;

/**
 * The properties of the drawn features, keyed the way a ranked hit is. Only
 * what is on screen is in here, which is what fitting the map first is for.
 */
export const collectRenderedProperties = (
  map: MaplibreMap,
  entries: IndexedFeatureEntry[]
): Map<string, Record<string, unknown>> => {
  const byKey = new Map<string, Record<string, unknown>>();
  for (const sourceId of new Set(entries.map((entry) => entry.sourceId))) {
    const layerIds = styleLayerIdsForSource(map, sourceId);
    if (layerIds.length === 0) {
      continue;
    }
    let features: MapGeoJSONFeature[] = [];
    try {
      features = map.queryRenderedFeatures({ layers: layerIds });
    } catch {
      // a style layer disappeared between the lookup and the query
      continue;
    }
    for (const feature of features) {
      if (feature.id == null) {
        continue;
      }
      byKey.set(
        featureKey({
          sourceId,
          sourceLayer: feature.sourceLayer,
          id: feature.id,
        }),
        feature.properties ?? {}
      );
    }
  }
  return byKey;
};

/** First of the named properties that carries something printable. */
export const pickProperty = (
  properties: Record<string, unknown> | undefined,
  names?: string[]
): string | undefined => {
  if (!properties || !names) {
    return undefined;
  }
  for (const name of names) {
    const value = properties[name];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return undefined;
};
