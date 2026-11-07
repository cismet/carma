import { useMemo } from "react";

import type { LibreLayer } from "../components/LibreMap";
import { rebindStyleSourceToGeoJson } from "../utils/geojsonSourceRebind";

export interface GeoJsonStyleLayerOptions {
  /** Name of the LibreLayer; also prefixes the namespaced source id */
  name: string;
  /** Vector style that does the rendering, e.g. https://tiles.cismet.de/<thema>/style.json */
  styleUrl: string;
  /** Source inside that style to replace with the collection */
  sourceId: string;
  /** Feature property used as feature id, keys feature-state (selection) */
  promoteId: string;
  /** The complete data, null while loading */
  collection: GeoJSON.FeatureCollection | null;
  /** Filter to AND into every layer of the style, null for none */
  userFilter?: unknown[] | null;
}

const NO_LAYERS: LibreLayer[] = [];

/**
 * The LibreLayer for a topic map that renders a complete GeoJSON through a
 * vector style: the style's source is swapped for the collection and the
 * current filter is baked into every layer. Memoized on collection and
 * filter, which is what LibreMap keys its style rebuild on. Empty while the
 * collection is still loading.
 */
export const useGeoJsonStyleLayer = ({
  name,
  styleUrl,
  sourceId,
  promoteId,
  collection,
  userFilter = null,
}: GeoJsonStyleLayerOptions): LibreLayer[] =>
  useMemo(() => {
    if (!collection) {
      return NO_LAYERS;
    }
    return [
      {
        type: "vector",
        name,
        style: styleUrl,
        promoteId,
        userStyleTransform: (style) =>
          rebindStyleSourceToGeoJson(style, {
            source: sourceId,
            data: collection,
            promoteId,
          }),
        // hosts that memoize layers via JSON.stringify see the data change
        userStyleTransformKey: `${sourceId}:${collection.features.length}`,
        userFilter,
      },
    ];
  }, [name, styleUrl, sourceId, promoteId, collection, userFilter]);
