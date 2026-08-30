/**
 * Style builder utilities for MapLibre GL
 *
 * Handles conversion of vector styles and GeoJSON layers to MapLibre style specification.
 */

import type {
  StyleSpecification,
  LayerSpecification,
  SpriteSpecification,
  GeoJSONSourceSpecification,
  SourceSpecification,
} from "maplibre-gl";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import slugify from "slugify";
import WMSCapabilities from "wms-capabilities";
import { extractCarmaConfig, md5FetchJSON } from "@carma-commons/utils";
import { WUPPERTAL_DEFAULT_STYLE } from "../constants/wuppertalDefaultStyle";
import { LibreLayer, type OpacityTransition } from "../components/LibreMap";
import { buildDimExpression, presentsFilterAsDim } from "./dimExpression";
import type { FilterPresentation } from "@carma-mapping/contexts";
import {
  createNonTiledImageSource,
  createNonTiledMetadata,
} from "./nonTiledWms";

// Inlined from @carma-mapping/layers to avoid circular dependency through portals
interface WMSLayerLike {
  Name?: string;
  Layer?: WMSLayerLike[];
  KeywordList?: string[];
  [key: string]: unknown;
}

const getLeafLayers = (
  layer: WMSLayerLike,
  leafLayers: WMSLayerLike[] = []
): WMSLayerLike[] => {
  if (layer.Layer && Array.isArray(layer.Layer) && layer.Layer.length > 0) {
    layer.Layer.forEach((subLayer) =>
      getLeafLayers(subLayer as WMSLayerLike, leafLayers)
    );
  } else {
    leafLayers.push(layer);
  }
  return leafLayers;
};

const getAllLeafLayers = (capabilities: unknown): WMSLayerLike[] => {
  const caps = capabilities as { Capability?: { Layer?: WMSLayerLike } };
  const rootLayer = caps?.Capability?.Layer;
  if (!rootLayer) return [];
  return getLeafLayers(rootLayer);
};

export interface VectorStyle {
  name: string;
  /** URL string (fetched) or inline maplibre style spec (used directly). */
  style: string | StyleSpecification;
  layer?: string;
  infoboxMapping?: string[];
  /** Optional filter expression to AND into every style layer in this vector style
   *  during construction. Original filter is preserved at metadata.originalFilter. */
  userFilter?: unknown[] | null;
  /** Optional pure transform applied to the freshly fetched/cloned stylesheet
   *  before it is merged. See LibreMap.VectorStyle.userStyleTransform. */
  userStyleTransform?: (style: any) => any;
  /** Serializable fingerprint of `userStyleTransform`. See LibreMap. */
  userStyleTransformKey?: string;
}

export interface GeoJsonStyleMetadata {
  sourceId: string;
  uniqueColors: string[];
}

// TODO: fix interface
// @ts-expect-error WMSCapabilities has no types
const parser = new WMSCapabilities();

/**
 * Get the correct paint property name for a layer type
 */
export const getPaintProperty = (
  layerStyle: LayerSpecification
): string | null => {
  const type = layerStyle.type;
  switch (type) {
    case "symbol":
      return layerStyle.id.includes("labels") ? "text-opacity" : "icon-opacity";
    case "raster":
      return "raster-opacity";
    case "line":
      return "line-opacity";
    case "fill":
      return "fill-opacity";
    case "circle":
      return "circle-opacity";
    case "background":
      return "background-opacity";
    case "fill-extrusion":
      return "fill-extrusion-opacity";
    case "heatmap":
      return "heatmap-opacity";
    default:
      // hillshade and other types have no simple opacity property
      return null;
  }
};

/**
 * Normalise a layer's requested opacity animation into MapLibre's transition
 * shape, or null when it wants none and MapLibre's default should stand.
 */
export const toOpacityTransitionSpec = (
  transition: OpacityTransition | undefined
): { duration: number; delay?: number } | null => {
  if (transition === undefined) return null;
  return typeof transition === "number" ? { duration: transition } : transition;
};

/** Legacy MapLibre/Mapbox "stops function" object, e.g. { stops: [[9, 0.32], [24, 1]] }. */
type StopsObject = { stops: [number, unknown][]; [k: string]: unknown };

export const isStopsObject = (value: unknown): value is StopsObject =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Array.isArray((value as { stops?: unknown }).stops);

export const scaleStopsObject = (
  stopsObj: StopsObject,
  scaleValue: (value: unknown) => unknown
): StopsObject => ({
  ...stopsObj,
  stops: stopsObj.stops.map(
    ([zoom, value]) => [zoom, scaleValue(value)] as [number, unknown]
  ),
});

/**
 * Apply marker symbol size scaling to a style
 */
export const styleManipulation = (
  markerSymbolSize: number,
  style: StyleSpecification
): StyleSpecification => {
  const scale = markerSymbolSize / 35;
  const newStyle = JSON.parse(JSON.stringify(style)) as StyleSpecification;

  if (newStyle.layers) {
    newStyle.layers = newStyle.layers.map((layer) => {
      if (layer.type !== "symbol") return layer;

      const updatedLayer = { ...layer };
      const layout = updatedLayer.layout || {};

      const hasIconSize = layout["icon-size"] !== undefined;
      const hasTextSize = layout["text-size"] !== undefined;

      if (hasIconSize) {
        const iconSize = layout["icon-size"];
        if (typeof iconSize === "number") {
          updatedLayer.layout = {
            ...layout,
            "icon-size": iconSize * scale,
          };
        } else if (Array.isArray(iconSize) && iconSize[0] === "interpolate") {
          // Handle interpolate expressions with stops
          const newIconSize = [...iconSize] as unknown[];
          // Find stops array (usually at index 3 and onwards, in pairs)
          for (let i = 3; i < newIconSize.length; i += 2) {
            if (typeof newIconSize[i + 1] === "number") {
              (newIconSize[i + 1] as number) =
                (newIconSize[i + 1] as number) * scale;
            }
          }
          updatedLayer.layout = {
            ...layout,
            "icon-size": newIconSize as typeof iconSize,
          };
        } else if (isStopsObject(iconSize)) {
          updatedLayer.layout = {
            ...layout,
            "icon-size": scaleStopsObject(
              iconSize,
              (value) => (value as number) * scale
            ) as typeof iconSize,
          };
        }
      }

      if (hasTextSize) {
        const textSize = layout["text-size"];
        if (typeof textSize === "number") {
          updatedLayer.layout = {
            ...(updatedLayer.layout || layout),
            "text-size": textSize * scale,
          };
        }

        const textOffset = layout["text-offset"];
        if (Array.isArray(textOffset) && textOffset[0] === "interpolate") {
          // Handle interpolate expressions with stops
          const newTextOffset = [...textOffset] as unknown[];
          // Find stops array (usually at index 3 and onwards, in pairs)
          for (let i = 3; i < newTextOffset.length; i += 2) {
            if (
              Array.isArray(newTextOffset[i + 1]) &&
              (newTextOffset[i + 1] as unknown[])[0] === "literal"
            ) {
              // Scale the y-offset (second element of the literal array)
              const literalArray = [
                ...((newTextOffset[i + 1] as unknown[])[1] as number[]),
              ] as number[];
              literalArray[1] = literalArray[1] * scale;
              newTextOffset[i + 1] = ["literal", literalArray];
            }
          }
          updatedLayer.layout = {
            ...(updatedLayer.layout || layout),
            "text-offset": newTextOffset as typeof textOffset,
          };
        } else if (Array.isArray(textOffset) && textOffset.length === 2) {
          const x = typeof textOffset[0] === "number" ? textOffset[0] : 0;
          const y = typeof textOffset[1] === "number" ? textOffset[1] : 0;
          updatedLayer.layout = {
            ...(updatedLayer.layout || layout),
            "text-offset": [x, y * scale] as typeof textOffset,
          };
        } else if (isStopsObject(textOffset)) {
          updatedLayer.layout = {
            ...(updatedLayer.layout || layout),
            "text-offset": scaleStopsObject(textOffset, (value) => {
              const offset = value;
              return [offset[0], offset[1] * scale];
            }) as typeof textOffset,
          };
        }
      }

      return updatedLayer;
    });
  }

  return newStyle;
};

/**
 * Get vector layer mapping from WMS capabilities or style metadata
 */
export const getVectorMapping = async (
  vectorStyles: VectorStyle[]
): Promise<Record<string, string[] | string>> => {
  const mapping: Record<string, string[] | string> = {};

  const layerPromises = vectorStyles.map(async (vectorStyle) => {
    let capabilitiesLayer = "";
    let capabilitiesUrl = "";
    let infoboxMapping: string[] | string | boolean =
      vectorStyle.infoboxMapping || [];
    let fetchedStyleJson: Record<string, unknown> | undefined;

    // First, try to get mapping from the vector style's metadata. When the
    // style is an inline spec, read it directly; when it is a URL string,
    // fetch and parse it.
    if (!vectorStyle.infoboxMapping && vectorStyle.style) {
      try {
        const styleJson: any =
          typeof vectorStyle.style === "string"
            ? await fetchJson(vectorStyle.style)
            : vectorStyle.style;
        fetchedStyleJson = styleJson;

        const styleKeywords =
          styleJson.metadata?.carmaConf?.layerInfo?.keywords;
        if (styleKeywords && Array.isArray(styleKeywords)) {
          const extractedFromStyle = extractCarmaConfig(styleKeywords);
          if (
            extractedFromStyle?.infoboxMapping &&
            (Array.isArray(extractedFromStyle.infoboxMapping) ||
              typeof extractedFromStyle.infoboxMapping === "string") &&
            extractedFromStyle.infoboxMapping.length > 0
          ) {
            infoboxMapping = extractedFromStyle.infoboxMapping;
          }
        }

        if (
          (!infoboxMapping ||
            (Array.isArray(infoboxMapping) && infoboxMapping.length === 0)) &&
          styleJson.layers
        ) {
          for (const layer of styleJson.layers) {
            const layerKeywords = layer.metadata?.carmaConf?.keywords;
            if (layerKeywords && Array.isArray(layerKeywords)) {
              const extractedFromLayer = extractCarmaConfig(layerKeywords);
              if (
                extractedFromLayer?.infoboxMapping &&
                (Array.isArray(extractedFromLayer.infoboxMapping) ||
                  typeof extractedFromLayer.infoboxMapping === "string") &&
                extractedFromLayer.infoboxMapping.length > 0
              ) {
                infoboxMapping = extractedFromLayer.infoboxMapping;
                break; // Use first layer with mapping found
              }
            }
          }
        }
      } catch (error) {
        console.warn("Error fetching vector style for carmaConf:", error);
      }
    }

    // Fallback to WMS capabilities if no mapping found yet
    if (
      vectorStyle.layer &&
      (!infoboxMapping ||
        (Array.isArray(infoboxMapping) && infoboxMapping.length === 0))
    ) {
      const atIdx = vectorStyle.layer.indexOf("@");
      if (atIdx > 0) {
        capabilitiesLayer = vectorStyle.layer.substring(0, atIdx);
        capabilitiesUrl = vectorStyle.layer.substring(atIdx + 1);
        if (capabilitiesUrl && !vectorStyle.infoboxMapping) {
          // An unreachable capabilities service must not reject this promise:
          // it would abort the mapping for every other layer as well.
          try {
            const capabilitiesText = await fetch(capabilitiesUrl).then(
              (response) => response.text()
            );
            const fetchedCapabilities = parser.toJSON(capabilitiesText);
            if (!fetchedCapabilities) {
              return;
            }

            const allLayers = getAllLeafLayers(fetchedCapabilities);
            const targetLayer = allLayers.find(
              (l) => l.Name === capabilitiesLayer
            );

            if (targetLayer) {
              const extractedCarmaConf = extractCarmaConfig(
                targetLayer.KeywordList
              );
              const rawMapping = extractedCarmaConf?.infoboxMapping;
              infoboxMapping =
                Array.isArray(rawMapping) || typeof rawMapping === "string"
                  ? rawMapping
                  : [];
            }
          } catch (error) {
            console.warn(
              "[styleBuilder] WMS capabilities unreachable — no infobox mapping",
              { url: capabilitiesUrl, error }
            );
            return;
          }
        }
      }
    }

    const layerId = capabilitiesLayer || vectorStyle.name;

    if (
      (Array.isArray(infoboxMapping) && infoboxMapping.length > 0) ||
      typeof infoboxMapping === "string"
    ) {
      mapping[layerId] = infoboxMapping;

      // Also index by source IDs and source-layer names from the style JSON
      // so 3D click handlers (which only know source/sourceLayer) can find the mapping.
      if (fetchedStyleJson) {
        const sources = fetchedStyleJson.sources as
          | Record<string, unknown>
          | undefined;
        if (sources) {
          for (const srcId of Object.keys(sources)) {
            if (!mapping[srcId]) {
              mapping[srcId] = infoboxMapping;
            }
          }
        }
        const styleLayers = fetchedStyleJson.layers as
          | Array<Record<string, unknown>>
          | undefined;
        if (styleLayers) {
          for (const sl of styleLayers) {
            const srcLayer = sl["source-layer"] as string | undefined;
            if (srcLayer && !mapping[srcLayer]) {
              mapping[srcLayer] = infoboxMapping;
            }
          }
        }
      }
    }
  });

  await Promise.all(layerPromises);

  return mapping;
};

/**
 * Extract GeoJSON data from a URL with caching
 */
export const extractGeoJson = async (
  geoJson: string
): Promise<GeoJSON.FeatureCollection> => {
  const result = await md5FetchJSON("libreGeoJson", geoJson);
  return result as unknown as GeoJSON.FeatureCollection;
};

/**
 * Convert Web Mercator coordinates to WGS84
 */
function convertTo4326(x: number, y: number): [number, number] {
  const lng = (x * 180) / 20037508.34;
  const lat =
    (Math.atan(Math.exp((y * Math.PI) / 20037508.34)) * 360) / Math.PI - 90;
  return [lng, lat];
}

/**
 * Transform POI features from Web Mercator to WGS84
 */
export const transformedPois = (
  pois: GeoJSON.FeatureCollection
): GeoJSON.FeatureCollection => {
  return {
    ...pois,
    features: pois.features.map((feature) => ({
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: convertTo4326(
          ...((feature.geometry as GeoJSON.Point).coordinates as [
            number,
            number
          ])
        ),
      },
    })),
  } as GeoJSON.FeatureCollection;
};

/**
 * Prefix image names inside a fill-pattern expression with the sprite namespace.
 *
 * Two strategies depending on expression type:
 * - step/interpolate (zoom-dependent): MapLibre requires these as the top-level
 *   expression, so we walk the structure in JS and prefix each string image name.
 * - Everything else (case, match, feature-property-driven, plain string): we use
 *   ["concat", "spriteId:", expr] and let MapLibre resolve it at runtime, because
 *   feature properties (["get", ...]) can't be resolved at build time.
 */
export const prefixPatternExpression = (
  spriteId: string,
  expr: unknown
): unknown => {
  if (typeof expr === "string") {
    return `${spriteId}:${expr}`;
  }
  if (!Array.isArray(expr)) return expr;

  const [op, ...rest] = expr;
  if (op === "step") {
    // ["step", input, defaultValue, stop1, value1, stop2, value2, ...]
    return [
      "step",
      rest[0],
      ...rest
        .slice(1)
        .map((v, i) =>
          i % 2 === 0 ? prefixPatternExpression(spriteId, v) : v
        ),
    ];
  }
  if (op === "interpolate") {
    // ["interpolate", interpolation, input, stop1, value1, stop2, value2, ...]
    return [
      "interpolate",
      rest[0],
      rest[1],
      ...rest
        .slice(2)
        .map((v, i) =>
          i % 2 === 1 ? prefixPatternExpression(spriteId, v) : v
        ),
    ];
  }
  // For all other expressions (case, match, etc.): let MapLibre resolve at runtime
  return ["concat", `${spriteId}:`, expr];
};

export interface VectorStylesToMapLibreStyleOptions {
  layers?: LibreLayer[];
  backgroundStyle?: StyleSpecification;
  clusteringEnabled?: boolean;
  /** Override glyphs (font) URL. undefined = use from first vector layer style, string = use this URL */
  overrideGlyphs?: string;
  /** What a layer's `userFilter` does: hide the rest (default) or fade it.
   *  Map-wide policy, set by whoever wants the highlight reading; the layers
   *  themselves stay unaware of it. */
  filterPresentation?: FilterPresentation;
}

/** Which MapLibre sources a host app layer (`carmaLayerId`) ended up owning. */
export interface LayerSourceRegistration {
  carmaLayerId: string;
  sourceIds: string[];
}

export interface VectorStylesToMapLibreStyleResult {
  style: StyleSpecification;
  geoJsonMetadata: GeoJsonStyleMetadata[];
  layerSources: LayerSourceRegistration[];
  failedLayerIds: string[];
}

/**
 * A layer with several invalid properties can report them one at a time, so the
 * style is re-validated after a drop. Bounded because a validator that keeps
 * reporting an error we cannot attribute to a layer must not spin forever.
 */
const MAX_VALIDATION_PASSES = 3;

/** `layers[2].paint.line-opacity: …` -> 2 */
const layerIndexFromMessage = (message: string): number | null => {
  const match = /^layers\[(\d+)\]/.exec(message);
  return match ? Number(match[1]) : null;
};

const dropInvalidLayers = (
  style: StyleSpecification,
  layerSources: LayerSourceRegistration[]
): string[] => {
  const ownerBySource = new Map<string, string>();
  for (const { carmaLayerId, sourceIds } of layerSources) {
    for (const sourceId of sourceIds) {
      ownerBySource.set(sourceId, carmaLayerId);
    }
  }

  const failed = new Set<string>();

  for (let pass = 0; pass < MAX_VALIDATION_PASSES; pass++) {
    const errors = validateStyleMin(style);
    if (errors.length === 0) {
      break;
    }

    const messagesByIndex = new Map<number, string[]>();
    for (const error of errors) {
      const index = layerIndexFromMessage(error.message);
      if (index === null) {
        // Not a layer problem (a source, the sprite, the glyphs): there is
        // nothing to drop, and MapLibre will refuse the style. Say so loudly.
        console.error(
          "[styleBuilder] invalid style outside of a layer, MapLibre will reject it:",
          error.message
        );
        continue;
      }
      const messages = messagesByIndex.get(index) ?? [];
      messages.push(error.message);
      messagesByIndex.set(index, messages);
    }
    if (messagesByIndex.size === 0) {
      break;
    }

    style.layers = style.layers.filter((styleLayer, index) => {
      const messages = messagesByIndex.get(index);
      if (!messages) {
        return true;
      }
      const source = (styleLayer as { source?: string }).source;
      const carmaLayerId = source ? ownerBySource.get(source) : undefined;
      if (carmaLayerId) {
        failed.add(carmaLayerId);
      }
      console.warn(
        "[styleBuilder] dropping layer MapLibre would reject — the rest of the style is kept",
        { layer: styleLayer.id, carmaLayerId, errors: messages }
      );
      return false;
    });
  }

  return [...failed];
};

const fetchJson = async (url: string): Promise<any> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  return response.json();
};

/**
 * Convert vector styles and GeoJSON layers to a MapLibre style specification
 */
export const vectorStylesToMapLibreStyle = async ({
  layers,
  backgroundStyle,
  clusteringEnabled = true,
  overrideGlyphs,
  filterPresentation = null,
}: VectorStylesToMapLibreStyleOptions): Promise<VectorStylesToMapLibreStyleResult> => {
  const defaultSprite = "https://tiles.cismet.de/poi/sprites";
  const customSprites: SpriteSpecification = [];
  const geoJsonMetadata: GeoJsonStyleMetadata[] = [];
  const layerSources: LayerSourceRegistration[] = [];
  const failedLayerIds: string[] = [];

  // Build stable, position-independent source/layer ids. Deriving ids from the
  // layer's content (WMS layers / name) instead of its array index means a
  // reorder produces ids identical to the previous render, so MapLibre's
  // setStyle diff keeps the existing sources (and their cached tiles) and only
  // reorders layers — no GetMap refetch. A numeric suffix is appended only when
  // two layers would otherwise collide on the same base id (rare: duplicate WMS
  // layers / names).
  const usedIds = new Set<string>();
  const makeUniqueId = (base: string): string => {
    let candidate = base;
    let suffix = 2;
    while (usedIds.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(candidate);
    return candidate;
  };

  // Use provided backgroundStyle or Wuppertal default
  const baseStyle: StyleSpecification =
    backgroundStyle || WUPPERTAL_DEFAULT_STYLE;

  const style: StyleSpecification = {
    ...baseStyle,
    // Deep-copy layers and sources so mutations (push, spread-assign) never affect baseStyle
    layers: [...(baseStyle.layers || [])],
    sources: { ...(baseStyle.sources || {}) },
    // glyphs: set explicitly if provided, otherwise filled from first vector layer below
    ...(overrideGlyphs ? { glyphs: overrideGlyphs } : {}),
    sprite: defaultSprite,
  };

  // Process layers array if provided
  if (layers && layers.length > 0) {
    // Fetch all remote data in parallel, then merge sequentially.
    // A layer whose remote data is unreachable resolves to null and is skipped:
    // rejecting here would abort the whole style build, leaving the map blank
    // and every layer stuck in "preparing" because setStyle never runs.
    const prefetched = await Promise.all(
      layers.map(async (layer) => {
        try {
          if (layer.type === "vector") {
            if (!layer.style) {
              console.warn(
                "[styleBuilder] vector layer has no style — skipping",
                { name: layer.name }
              );
              return null;
            }
            if (typeof layer.style === "string") {
              const fetched = await fetchJson(layer.style);
              const transformed = layer.userStyleTransform
                ? layer.userStyleTransform(fetched) ?? fetched
                : fetched;
              return { type: "vector" as const, data: transformed };
            }
            // Deep-clone the inline spec so the per-render prefixing below
            // doesn't mutate the caller's object (which would compound IDs
            // on every rerender).
            const cloned = JSON.parse(JSON.stringify(layer.style));
            const transformed = layer.userStyleTransform
              ? layer.userStyleTransform(cloned) ?? cloned
              : cloned;
            return {
              type: "vector" as const,
              data: transformed,
            };
          } else if (layer.type === "geojson") {
            const result = await extractGeoJson(layer.data!);
            return { type: "geojson" as const, data: transformedPois(result) };
          } else if (layer.type === "wms" || layer.type === "wmts") {
            return { type: "wms" as const, data: layer };
          } else if (layer.type === "tiles") {
            return { type: "tiles" as const, data: layer };
          }
          return null;
        } catch (error) {
          console.warn(
            "[styleBuilder] layer data unreachable — skipping layer",
            {
              name: (layer as { name?: string }).name,
              type: layer.type,
              error,
            }
          );
          if (layer.carmaLayerId) {
            failedLayerIds.push(layer.carmaLayerId);
          }
          return null;
        }
      })
    );

    for (let index = 0; index < layers.length; index++) {
      const layer = layers[index];
      const fetched = prefetched[index];
      if (!fetched) continue;

      const recordSources = (sourceIds: string[]) => {
        if (layer.carmaLayerId && sourceIds.length > 0) {
          layerSources.push({ carmaLayerId: layer.carmaLayerId, sourceIds });
        }
      };

      if (layer.type === "vector") {
        const additionalStyle = fetched.data;
        let capabilitiesLayer = "";

        if (layer.layer) {
          const atIdx = layer.layer.indexOf("@");
          capabilitiesLayer = layer.layer.substring(0, atIdx);
        }

        const layerId = capabilitiesLayer || layer.name;

        // Namespace source IDs to avoid collisions between vector layers that
        // happen to use the same internal source name (e.g. multiple saved
        // measurements both naming their source "adhoc"). Build a rename map,
        // emit a namespaced sources object, and rewrite each layer's `source`
        // reference below.
        const sourceRename: Record<string, string> = {};
        const namespacedSources: Record<string, SourceSpecification> = {};
        for (const [srcId, srcDef] of Object.entries(
          (additionalStyle.sources as Record<string, SourceSpecification>) || {}
        )) {
          const namespacedId = `${layerId}::${srcId}`;
          sourceRename[srcId] = namespacedId;
          namespacedSources[namespacedId] = srcDef;
        }

        let spriteId = layerId.replace(":", "_");
        if (additionalStyle.sprite) {
          spriteId = slugify(additionalStyle.sprite, {
            remove: /[^a-zA-Z0-9]/g,
            lower: true,
          });

          const spriteExists = (
            customSprites as Array<{ id: string; url: string }>
          ).some((sprite) => sprite.id === spriteId);
          if (!spriteExists) {
            (customSprites as Array<{ id: string; url: string }>).push({
              id: spriteId,
              url: additionalStyle.sprite,
            });
          }
        }
        // The host's expression says which features are meant. Whether that
        // means "only these" or "these, the rest faded" is the map's policy,
        // not the layer's, so the same input serves both readings: as a filter
        // it is ANDed into the layer's own filter, as a dim it becomes the
        // predicate the opacity below branches on while the filter stays put.
        const selection = (layer as { userFilter?: unknown[] | null })
          .userFilter;
        const dimming =
          selection &&
          presentsFilterAsDim(
            filterPresentation,
            layer.carmaLayerId ?? layer.name
          );
        const userFilter = dimming ? null : selection;
        const userDim = dimming
          ? {
              predicate: selection as unknown[],
              dimOpacity: filterPresentation!.dimOpacity,
            }
          : null;
        additionalStyle.layers = additionalStyle.layers.map(
          (styleLayer: LayerSpecification) => {
            const src = (styleLayer as { source?: string }).source;
            const origFilter =
              (styleLayer as { filter?: unknown[] }).filter ?? null;
            let bakedFilter: unknown[] | null = origFilter;
            if (userFilter) {
              bakedFilter = origFilter
                ? (["all", origFilter, userFilter] as unknown[])
                : (userFilter as unknown[]);
            }
            return {
              ...styleLayer,
              id: `${layerId}-${styleLayer.id}`,
              ...(src && sourceRename[src]
                ? { source: sourceRename[src] }
                : {}),
              ...(userFilter ? { filter: bakedFilter as never } : {}),
              metadata: {
                ...(
                  styleLayer as LayerSpecification & {
                    metadata?: Record<string, unknown>;
                  }
                ).metadata,
                "z-index": index,
                "layer-id": layerId,
                // What the layer bar's slider asks of this layer. A 2D layer
                // gets it baked into its paint properties just below, but a
                // layer that only carries a 3D configuration has no paint to
                // bake it into, so it travels here as well.
                "layer-opacity": layer.opacity ?? 1,
                ...(userFilter ? { originalFilter: origFilter } : {}),
              },
              paint: {
                ...styleLayer.paint,
                ...(() => {
                  if (styleLayer.id.toLowerCase().includes("selection"))
                    return {};
                  // Symbol layers need both text-opacity and icon-opacity
                  const props =
                    styleLayer.type === "symbol"
                      ? ["text-opacity", "icon-opacity"]
                      : ([getPaintProperty(styleLayer)].filter(
                          Boolean
                        ) as string[]);
                  if (props.length === 0) return {};
                  const layerOpacity = layer.opacity ?? 1;
                  // A layer may ask for its opacity changes to be animated. The
                  // whole style is rebuilt and diffed on every change here, so
                  // the duration has to travel with the layer as a paint
                  // property; MapLibre picks it up when the diff moves the
                  // opacity. Absent, its own default applies.
                  const transitionSpec = toOpacityTransitionSpec(
                    layer.opacityTransition
                  );
                  const result: Record<string, unknown> = {};
                  for (const prop of props) {
                    const baseOpacity =
                      (styleLayer.paint as Record<string, unknown>)?.[prop] ||
                      1;
                    const baked =
                      typeof baseOpacity === "number"
                        ? baseOpacity * layerOpacity
                        : layerOpacity < 1
                        ? layerOpacity
                        : baseOpacity;
                    // The dim wraps whatever the slider already produced, so it
                    // composes with the layer's opacity instead of replacing it
                    // and never makes a value less legal than it was: a curve it
                    // cannot wrap comes back null and stays undimmed.
                    const dimmed = userDim
                      ? buildDimExpression(
                          baked,
                          userDim.predicate,
                          userDim.dimOpacity
                        )
                      : null;
                    result[prop] = dimmed ?? baked;
                    if (transitionSpec) {
                      result[`${prop}-transition`] = transitionSpec;
                    }
                  }
                  return result;
                })(),
                ...((styleLayer.paint as Record<string, unknown>)?.[
                  "fill-pattern"
                ] !== undefined
                  ? {
                      "fill-pattern": prefixPatternExpression(
                        spriteId,
                        (styleLayer.paint as Record<string, unknown>)[
                          "fill-pattern"
                        ]
                      ),
                    }
                  : {}),
              },
              layout: {
                ...(
                  styleLayer as LayerSpecification & {
                    layout?: Record<string, unknown>;
                  }
                ).layout,
                ...((
                  styleLayer as LayerSpecification & {
                    layout?: Record<string, unknown>;
                  }
                ).layout?.["icon-image"] !== undefined
                  ? {
                      "icon-image": [
                        "concat",
                        `${spriteId}:`,
                        (
                          styleLayer as LayerSpecification & {
                            layout?: Record<string, unknown>;
                          }
                        ).layout?.["icon-image"],
                      ],
                    }
                  : {}),
              },
            };
          }
        );

        style.sources = { ...style.sources, ...namespacedSources };
        style.layers = [...style.layers!, ...additionalStyle.layers];
        recordSources(Object.keys(namespacedSources));

        // Adopt glyphs from the first vector style that provides them
        // (unless explicitly set via the glyphs option)
        if (!style.glyphs && additionalStyle.glyphs) {
          style.glyphs = additionalStyle.glyphs;
        }
      } else if (layer.type === "geojson") {
        const transformedData = fetched.data;
        const sourceId = makeUniqueId(
          `geojson-source-${layer.name.replace(/[^a-zA-Z0-9]/g, "-")}`
        );
        const colorProperty = layer.colorProperty ?? "schrift";

        // Get unique colors from the geojson features
        const uniqueColors: string[] = Array.from(
          new Set(
            (transformedData.features as GeoJSON.Feature[])
              .map(
                (f) =>
                  (f.properties as Record<string, unknown>)?.[colorProperty]
              )
              .filter((color): color is string => typeof color === "string")
          )
        );

        // Store metadata for pie chart rendering
        geoJsonMetadata.push({ sourceId, uniqueColors });

        // Add the GeoJSON source with optional cluster properties for pie charts
        const sourceConfig: GeoJSONSourceSpecification = {
          type: "geojson",
          data: transformedData,
          ...(layer.promoteId ? { promoteId: layer.promoteId } : {}),
        };

        if (clusteringEnabled) {
          sourceConfig.cluster = true;
          sourceConfig.clusterMaxZoom = 16;
          sourceConfig.clusterRadius = 40;
          sourceConfig.clusterProperties = Object.fromEntries(
            uniqueColors.map((color) => [
              color,
              ["+", ["case", ["==", ["get", colorProperty], color], 1, 0]],
            ])
          );
        }

        style.sources = {
          ...style.sources,
          [sourceId]: sourceConfig as SourceSpecification,
        };

        // Add layers for the GeoJSON source
        const geoJsonLayers: LayerSpecification[] = [];

        // Only add cluster layer if clustering is enabled
        if (clusteringEnabled) {
          geoJsonLayers.push({
            id: `${sourceId}-clusters`,
            type: "circle",
            source: sourceId,
            filter: ["has", "point_count"],
            paint: {
              "circle-color": "rgba(0,0,0,0)", // Transparent - pie chart markers will be used instead
              "circle-radius": 20,
            },
          });
        }

        geoJsonLayers.push({
          id: `${sourceId}-images-selection`,
          type: "symbol",
          source: sourceId,
          minzoom: 9,
          maxzoom: 24,
          layout: {
            visibility: "visible",
            "symbol-z-order": "source",
            "symbol-sort-key": ["get", "geographicidentifier"],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "icon-size": ["interpolate", ["linear"], ["zoom"], 9, 0.32, 24, 1],
            "icon-padding": 0,
            "icon-image": "Icon_Full#4892F0",
          },
          paint: {
            "icon-opacity": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              1,
              0,
            ],
          },
        });

        geoJsonLayers.push({
          id: `${sourceId}-poi-images`,
          type: "symbol",
          source: sourceId,
          minzoom: 0,
          maxzoom: 24,
          filter: ["!", ["has", "point_count"]],
          layout: {
            visibility: "visible",
            "symbol-z-order": "source",
            "symbol-sort-key": ["get", "geographicidentifier"],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "icon-size": [
              "interpolate",
              ["linear"],
              ["zoom"],
              9,
              0.32,
              24,
              0.8,
            ],
            "icon-padding": 0,
            "icon-image": ["concat", ["get", "signatur"], ["get", "schrift"]],
          },
          paint: {
            "icon-color": ["get", "schrift"],
          },
        });

        geoJsonLayers.push({
          id: `${sourceId}-poi-labels`,
          type: "symbol",
          source: sourceId,
          filter: ["!", ["has", "point_count"]],
          minzoom: 16,
          maxzoom: 24,
          layout: {
            "text-field": ["get", "geographicidentifier"],
            "text-font": ["Open Sans Semibold"],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "text-size": 12,
            "text-offset": [
              "interpolate",
              ["linear"],
              ["zoom"],
              17,
              ["literal", [0, 1.3]],
              24,
              ["literal", [0, 2]],
            ],
            "text-anchor": "top",
            "text-allow-overlap": true,
            "text-rotation-alignment": "viewport",
          },
          paint: {
            "text-halo-color": "#FFFFFF",
            "text-halo-width": 5,
            "text-color": ["get", "schrift"],
            "text-opacity": 1,
          },
        });

        style.layers = [...style.layers!, ...geoJsonLayers];
        recordSources([sourceId]);
      } else if (layer.type === "wms" || layer.type === "wmts") {
        const sanitized = layer.layers.replace(/[^a-zA-Z0-9]/g, "-");
        const id = makeUniqueId(sanitized);
        const sourceId = `source-${id}`;
        const version = layer.version || "1.1.1";
        const crsParam = version >= "1.3.0" ? "crs" : "srs";
        const isWmts = layer.type === "wmts";

        if (layer.nonTiled) {
          style.sources[sourceId] = createNonTiledImageSource();
          style.layers.push({
            id: id,
            type: "raster",
            source: sourceId,
            paint: {
              "raster-opacity": layer.opacity ?? 1,
              ...(toOpacityTransitionSpec(
                "opacityTransition" in layer
                  ? layer.opacityTransition
                  : undefined
              )
                ? {
                    "raster-opacity-transition": toOpacityTransitionSpec(
                      "opacityTransition" in layer
                        ? layer.opacityTransition
                        : undefined
                    ),
                  }
                : {}),
              ...("rasterPaint" in layer ? layer.rasterPaint : undefined),
            },
            metadata: {
              "z-index": index,
              "layer-id": id,
              ...createNonTiledMetadata({
                url: layer.url,
                layers: layer.layers,
                styles: layer.styles,
                version: layer.version,
                format: layer.format,
                transparent: layer.transparent,
                isWmts,
              }),
            },
          });
          recordSources([sourceId]);
          continue;
        }

        const querySep = layer.url.endsWith("?")
          ? ""
          : layer.url.includes("?")
          ? "&"
          : "?";
        style.sources[sourceId] = {
          type: "raster",
          tiles: [
            `${
              layer.url
            }${querySep}service=WMS&version=${version}&request=GetMap&layers=${
              layer.layers
            }&styles=${layer.styles || ""}&format=${
              layer.format || "image/png"
            }&transparent=${layer.transparent ? "true" : "false"}${
              isWmts ? "&type=wmts" : ""
            }&width=${layer.tileSize ?? 256}&height=${
              layer.tileSize ?? 256
            }&${crsParam}=EPSG:3857&bbox={bbox-epsg-3857}`,
          ],
          tileSize: layer.tileSize ?? 256,
        };

        style.layers.push({
          id: id,
          type: "raster",
          source: sourceId,
          paint: {
            "raster-opacity": layer.opacity ?? 1,
            ...(toOpacityTransitionSpec(
              "opacityTransition" in layer ? layer.opacityTransition : undefined
            )
              ? {
                  "raster-opacity-transition": toOpacityTransitionSpec(
                    "opacityTransition" in layer
                      ? layer.opacityTransition
                      : undefined
                  ),
                }
              : {}),
            ...("rasterPaint" in layer ? layer.rasterPaint : undefined),
          },
          metadata: {
            "z-index": index,
            "layer-id": id,
          },
        });
        recordSources([sourceId]);
      } else if (layer.type === "tiles") {
        const sanitized = layer.name.replace(/[^a-zA-Z0-9]/g, "-");
        const id = makeUniqueId(sanitized);
        const sourceId = `source-${id}`;

        style.sources[sourceId] = {
          type: "raster",
          tiles: [layer.url],
          tileSize: layer.tileSize ?? 256,
          ...(layer.maxZoom !== undefined ? { maxzoom: layer.maxZoom } : {}),
        };

        style.layers.push({
          id: id,
          type: "raster",
          source: sourceId,
          paint: {
            "raster-opacity": layer.opacity ?? 1,
            ...(toOpacityTransitionSpec(
              "opacityTransition" in layer ? layer.opacityTransition : undefined
            )
              ? {
                  "raster-opacity-transition": toOpacityTransitionSpec(
                    "opacityTransition" in layer
                      ? layer.opacityTransition
                      : undefined
                  ),
                }
              : {}),
            ...("rasterPaint" in layer ? layer.rasterPaint : undefined),
          },
          metadata: {
            "z-index": index,
            "layer-id": id,
          },
        });
        recordSources([sourceId]);
      }
      // COG layers are handled separately via map.addSource/addLayer after setStyle
    }
  }

  if ((customSprites as Array<{ id: string; url: string }>).length > 0) {
    style.sprite = customSprites;
  }

  failedLayerIds.push(...dropInvalidLayers(style, layerSources));

  return { style, geoJsonMetadata, layerSources, failedLayerIds };
};
