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

// Re-export types that consumers need
export interface LibreLayer {
  name: string;
  type: "vector" | "geojson";
  style?: string;
  data?: string;
  layer?: string;
  infoboxMapping?: string[];
}

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
const getPaintProperty = (layerStyle: LayerSpecification): string => {
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
    default:
      return "icon-opacity";
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
    let infoboxMapping: string[] | string = vectorStyle.infoboxMapping || [];

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
const extractGeoJson = async (
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
const transformedPois = (
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

export interface VectorStylesToMapLibreStyleOptions {
  layers?: LibreLayer[];
  backgroundStyle?: StyleSpecification;
  clusteringEnabled?: boolean;
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
}: VectorStylesToMapLibreStyleOptions): Promise<VectorStylesToMapLibreStyleResult> => {
  const defaultSprite = "https://tiles.cismet.de/poi/sprites";
  const customSprites: SpriteSpecification = [];
  const geoJsonMetadata: GeoJsonStyleMetadata[] = [];

  // Use provided backgroundStyle or Wuppertal default
  const baseStyle: StyleSpecification =
    backgroundStyle || WUPPERTAL_DEFAULT_STYLE;

  const style: StyleSpecification = {
    ...baseStyle,
    glyphs: "https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf",
    sprite: defaultSprite,
  };

  // Process layers array if provided
  if (layers && layers.length > 0) {
    const layerPromises = layers.map(async (layer, index) => {
      if (layer.type === "vector") {
        // Handle vector layer
        const response = await fetch(layer.style!);
        const additionalStyle = await response.json();
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
              ...(styleLayer.id.toLowerCase().includes("selection")
                ? {}
                : {
                    [getPaintProperty(styleLayer)]:
                      (styleLayer.paint as Record<string, unknown>)?.[
                        getPaintProperty(styleLayer)
                      ] || 1,
                  }),
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
      } else if (layer.type === "geojson") {
        // Handle geojson layer
        const result = await extractGeoJson(layer.data!);
        const transformedData = transformedPois(result);

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
      }
    });

    await Promise.all(layerPromises);
  }

  if ((customSprites as Array<{ id: string; url: string }>).length > 0) {
    style.sprite = customSprites;
  }

  return { style, geoJsonMetadata };
};
