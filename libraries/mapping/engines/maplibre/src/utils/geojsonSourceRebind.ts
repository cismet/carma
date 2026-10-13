import type {
  FilterSpecification,
  LayerSpecification,
  StyleSpecification,
} from "maplibre-gl";
import { SOURCE_LAYER_PROPERTY } from "@carma-mapping/utils";

export interface RebindStyleSourceToGeoJsonOptions {
  /** Id of the source inside the style to replace, e.g. "vorhabenkarte_source". */
  source: string;
  /** Inline collection or URL. Features that should match a `source-layer`
   *  of the original style carry that name in `properties._sourceLayer`. */
  data: GeoJSON.FeatureCollection | string;
  /** Feature property to use as feature id (MapLibre `promoteId`). */
  promoteId?: string;
  /** Property carrying the source-layer name; defaults to `_sourceLayer`. */
  sourceLayerProperty?: string;
}

/**
 * Swap one vector source of a style for a geojson source, keeping every layer
 * of the style as it is. Layers that referenced a `source-layer` of the old
 * source get that reference turned into a property filter, so a single geojson
 * collection can serve several "source-layers" of the original style.
 *
 * Returns a new style; the input is not mutated. A style without the named
 * source is returned as is.
 */
export function rebindStyleSourceToGeoJson(
  style: StyleSpecification,
  options: RebindStyleSourceToGeoJsonOptions
): StyleSpecification {
  const {
    source,
    data,
    promoteId,
    sourceLayerProperty = SOURCE_LAYER_PROPERTY,
  } = options;

  if (!style.sources?.[source]) {
    console.warn(
      "[rebindStyleSourceToGeoJson] style has no source named",
      source
    );
    return style;
  }

  const layers = (style.layers ?? []).map((layer) => {
    if (!("source" in layer) || layer.source !== source) {
      return layer;
    }
    const {
      "source-layer": sourceLayer,
      filter: originalFilter,
      ...rest
    } = layer as LayerSpecification & {
      "source-layer"?: string;
      filter?: FilterSpecification;
    };
    if (!sourceLayer) {
      return layer;
    }
    const byLayer: FilterSpecification = [
      "==",
      ["get", sourceLayerProperty],
      sourceLayer,
    ];
    // Legacy and expression filters share the "all" combinator but not a
    // common tuple type; same cast styleBuilder uses for userFilter.
    const filter = (
      originalFilter ? ["all", originalFilter, byLayer] : byLayer
    ) as FilterSpecification;
    return { ...rest, filter } as LayerSpecification;
  });

  return {
    ...style,
    sources: {
      ...style.sources,
      [source]: {
        type: "geojson",
        data,
        ...(promoteId ? { promoteId } : {}),
      },
    },
    layers,
  };
}
