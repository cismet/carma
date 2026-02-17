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
import slugify from "slugify";
import WMSCapabilities from "wms-capabilities";
import { extractCarmaConfig, md5FetchJSON } from "@carma-commons/utils";
import { WUPPERTAL_DEFAULT_STYLE } from "../constants/wuppertalDefaultStyle";
import { LibreLayer } from "../components/LibreMap";

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
  style?: string;
  layer?: string;
  infoboxMapping?: string[];
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
 * Apply marker symbol size scaling to a style
 */
export const styleManipulation = (
  markerSymbolSize: number,
  style: StyleSpecification
): StyleSpecification => {
  const scale = (markerSymbolSize / 35) * 1.35;
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

    // First, try to get mapping from the vector style's metadata
    if (!vectorStyle.infoboxMapping && vectorStyle.style) {
      try {
        const styleResponse = await fetch(vectorStyle.style);
        const styleJson = await styleResponse.json();

        const styleKeywords =
          styleJson.metadata?.carmaConf?.layerInfo?.keywords;
        if (styleKeywords && Array.isArray(styleKeywords)) {
          const extractedFromStyle = extractCarmaConfig(styleKeywords);
          if (
            extractedFromStyle?.infoboxMapping &&
            typeof extractedFromStyle.infoboxMapping !== "boolean" &&
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
                typeof extractedFromLayer.infoboxMapping !== "boolean" &&
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
            infoboxMapping = extractedCarmaConf?.infoboxMapping || [];
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
}

export interface VectorStylesToMapLibreStyleResult {
  style: StyleSpecification;
  geoJsonMetadata: GeoJsonStyleMetadata[];
}

/**
 * Convert vector styles and GeoJSON layers to a MapLibre style specification
 */
export const vectorStylesToMapLibreStyle = async ({
  layers,
  backgroundStyle,
  clusteringEnabled = true,
  overrideGlyphs,
}: VectorStylesToMapLibreStyleOptions): Promise<VectorStylesToMapLibreStyleResult> => {
  const defaultSprite = "https://tiles.cismet.de/poi/sprites";
  const customSprites: SpriteSpecification = [];
  const geoJsonMetadata: GeoJsonStyleMetadata[] = [];

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
    // Fetch all remote data in parallel, then merge sequentially
    const prefetched = await Promise.all(
      layers.map(async (layer) => {
        if (layer.type === "vector") {
          const response = await fetch(layer.style!);
          return { type: "vector" as const, data: await response.json() };
        } else if (layer.type === "geojson") {
          const result = await extractGeoJson(layer.data!);
          return { type: "geojson" as const, data: transformedPois(result) };
        } else if (layer.type === "wms" || layer.type === "wmts") {
          return { type: "wms" as const, data: layer };
        }
        return null;
      })
    );

    for (let index = 0; index < layers.length; index++) {
      const layer = layers[index];
      const fetched = prefetched[index];
      if (!fetched) continue;

      if (layer.type === "vector") {
        const additionalStyle = fetched.data;
        let capabilitiesLayer = "";

        if (layer.layer) {
          const atIdx = layer.layer.indexOf("@");
          capabilitiesLayer = layer.layer.substring(0, atIdx);
        }

        const layerId = capabilitiesLayer || layer.name;
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
        additionalStyle.layers = additionalStyle.layers.map(
          (styleLayer: LayerSpecification) => ({
            ...styleLayer,
            id: `${layerId}-${styleLayer.id}`,
            metadata: {
              ...(
                styleLayer as LayerSpecification & {
                  metadata?: Record<string, unknown>;
                }
              ).metadata,
              "z-index": index,
              "layer-id": layerId,
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
                const result: Record<string, unknown> = {};
                for (const prop of props) {
                  const baseOpacity =
                    (styleLayer.paint as Record<string, unknown>)?.[prop] || 1;
                  result[prop] =
                    typeof baseOpacity === "number"
                      ? baseOpacity * layerOpacity
                      : layerOpacity < 1
                      ? layerOpacity
                      : baseOpacity;
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
          })
        );

        style.sources = { ...style.sources, ...additionalStyle.sources };
        style.layers = [...style.layers!, ...additionalStyle.layers];

        // Adopt glyphs from the first vector style that provides them
        // (unless explicitly set via the glyphs option)
        if (!style.glyphs && additionalStyle.glyphs) {
          style.glyphs = additionalStyle.glyphs;
        }
      } else if (layer.type === "geojson") {
        const transformedData = fetched.data;
        const sourceId = `geojson-source-${index}`;

        // Get unique colors from the geojson features
        const uniqueColors: string[] = Array.from(
          new Set(
            (transformedData.features as GeoJSON.Feature[])
              .map((f) => (f.properties as Record<string, unknown>)?.schrift)
              .filter((color): color is string => typeof color === "string")
          )
        );

        // Store metadata for pie chart rendering
        geoJsonMetadata.push({ sourceId, uniqueColors });

        // Add the GeoJSON source with optional cluster properties for pie charts
        const sourceConfig: GeoJSONSourceSpecification = {
          type: "geojson",
          data: transformedData,
        };

        if (clusteringEnabled) {
          sourceConfig.cluster = true;
          sourceConfig.clusterMaxZoom = 16;
          sourceConfig.clusterRadius = 40;
          sourceConfig.clusterProperties = Object.fromEntries(
            uniqueColors.map((color) => [
              color,
              ["+", ["case", ["==", ["get", "schrift"], color], 1, 0]],
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
      } else if (layer.type === "wms" || layer.type === "wmts") {
        const sanitized = layer.layers.replace(/[^a-zA-Z0-9]/g, "-");
        const sourceId = `source-${sanitized}-${index}`;
        const id = `${sanitized}-${index}`;
        const version = layer.version || "1.1.1";
        const crsParam = version >= "1.3.0" ? "crs" : "srs";
        const isWmts = layer.type === "wmts";

        style.sources[sourceId] = {
          type: "raster",
          tiles: [
            `${layer.url}${
              layer.url.endsWith("?") ? "" : "?"
            }service=WMS&version=${version}&request=GetMap&layers=${
              layer.layers
            }&styles=${layer.styles || (isWmts ? "default" : "")}&format=${
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
          },
          metadata: {
            "z-index": index,
            "layer-id": id,
          },
        });
      }
      // COG layers are handled separately via map.addSource/addLayer after setStyle
    }
  }

  if ((customSprites as Array<{ id: string; url: string }>).length > 0) {
    style.sprite = customSprites;
  }

  return { style, geoJsonMetadata };
};
