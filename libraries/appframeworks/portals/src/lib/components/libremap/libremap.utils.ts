import { type StyleSpecification, type LayerSpecification } from "maplibre-gl";
import slugify from "slugify";
import WMSCapabilities from "wms-capabilities";
import { LibreLayer, VectorStyle } from "../CarmaMap";
import { getAllLeafLayers } from "@carma-mapping/layers";
import { extractCarmaConfig } from "@carma-commons/utils";
import { md5FetchJSON } from "libraries/commons/utils/src/lib/fetching/fetching.ts";
// import type { Layer, Layer2, Layer3 } from "wms-capabilities";

// TODO: fix interface
// @ts-expect-error tbd
const parser = new WMSCapabilities();

// Pie chart helper functions for cluster visualization
function pieSegment(start: number, end: number, r: number, color: string) {
  if (end - start === 1) end -= 0.00001;
  const a0 = 2 * Math.PI * (start - 0.25);
  const a1 = 2 * Math.PI * (end - 0.25);
  const x0 = Math.cos(a0),
    y0 = Math.sin(a0);
  const x1 = Math.cos(a1),
    y1 = Math.sin(a1);
  const largeArc = end - start > 0.5 ? 1 : 0;

  return [
    '<path d="M',
    r,
    r,
    "L",
    r + r * x0,
    r + r * y0,
    "A",
    r,
    r,
    0,
    largeArc,
    1,
    r + r * x1,
    r + r * y1,
    "Z",
    `" fill="${color}" />`,
  ].join(" ");
}

export function createPieChart(props: any, uniqueColors: string[]) {
  const offsets: number[] = [];
  const counts = uniqueColors.map((color) => props[color] || 0);
  let total = 0;
  for (let i = 0; i < counts.length; i++) {
    offsets.push(total);
    total += counts[i];
  }
  const baseFontsize = 10;
  const fontSize =
    total >= 1000
      ? baseFontsize * 1.375
      : total >= 100
      ? baseFontsize * 1.25
      : total >= 10
      ? baseFontsize * 1.125
      : baseFontsize;
  const baseCircleSize = 25;
  const r =
    total >= 1000
      ? baseCircleSize * 2.777
      : total >= 100
      ? baseCircleSize * 1.7777
      : total >= 10
      ? baseCircleSize * 1.3333
      : baseCircleSize;
  const w = r * 2;
  const svgSize = w + 2; // 1px extra on each side

  let html = `<div><svg width="${svgSize}" height="${svgSize}" viewbox="0 0 ${svgSize} ${svgSize}" text-anchor="middle" style="font: ${fontSize}px sans-serif; display: block">`;

  // Translate the group to center the content in the larger SVG
  html += `<g transform="translate(1,1)">`;

  for (let i = 0; i < counts.length; i++) {
    if (counts[i] > 0) {
      html += pieSegment(
        offsets[i] / total,
        (offsets[i] + counts[i]) / total,
        r,
        uniqueColors[i]
      );
    }
  }

  html += `<circle cx="${r}" cy="${r}" r="${Math.round(
    r * 0.4
  )}" fill="white" fill-opacity="0.75"/>`;
  html += `<circle cx="${r}" cy="${r}" r="${r}" stroke="#000" stroke-width="1" fill="none"/>`;
  html += `<text dominant-baseline="central" transform="translate(${r}, ${r})">${total.toLocaleString()}</text></g></svg></div>`;

  const el = document.createElement("div");
  el.innerHTML = html;
  return el.firstChild as HTMLElement;
}

const getPaintProperty = (layerStyle: LayerSpecification) => {
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
    default:
      return "icon-opacity";
  }
};

export const getCoordinates = (geometry) => {
  switch (geometry.type) {
    case "Polygon":
      return geometry.coordinates[0][0];
    case "MultiPolygon":
      return geometry.coordinates[0][0][0];
    case "LineString":
      return geometry.coordinates[1];
    default:
      return geometry.coordinates;
  }
};

export const truncateString = (text: string, num: number) => {
  if (text.length > num) {
    return text.slice(0, num) + "...";
  }
  return text;
};

export const functionToFeature = (output: any, code: string) => {
  try {
    let codeFunction = eval("(" + code + ")");
    const tmpInfo = codeFunction(output);

    if (!tmpInfo) {
      return undefined;
    }

    const properties = {
      ...tmpInfo,
      wmsProps: output,
    };

    return { properties };
  } catch (error) {
    console.log(error);
    return undefined;
  }
};

export const objectToFeature = (jsonOutput: any, code: string) => {
  if (!jsonOutput) {
    return {
      properties: {
        title: "Keine Informationen gefunden",
      },
    };
  }

  const conf = code
    .split("\n")
    .filter((line) => line.trim() !== "" && line.trim() !== "undefined");

  let functionString = `(function(p) {
                    const info = {`;

  conf.forEach((rule) => {
    functionString += `${rule.trim()},\n`;
  });

  functionString += `
                                          };
                                          return info;
                    })`;

  const tmpInfo = eval(functionString)(jsonOutput);

  const properties = {
    ...tmpInfo,
    wmsProps: jsonOutput,
  };

  return { properties };
};

export const createFeature = (selectedVectorFeature, layerMapping) => {
  let feature = undefined;

  let properties = selectedVectorFeature.properties;
  properties = {
    ...properties,
    vectorId: selectedVectorFeature.id,
  };
  let result = "";
  let featureInfoZoom = 20;
  let blockLegacyGetFeatureInfo = false;
  layerMapping.forEach((keyword) => {
    result += keyword + "\n";
  });

  if (result) {
    if (result.includes("function")) {
      // remove every line that is not a function
      result = result
        .split("\n")
        .filter((line) => line.includes("function"))
        .join("\n");
    }

    const featureProperties = result.includes("function")
      ? functionToFeature(properties, result)
      : objectToFeature(properties, result);
    if (!featureProperties) {
      return undefined;
    }
    const genericLinks = featureProperties.properties.genericLinks || [];

    feature = {
      properties: {
        ...featureProperties.properties,
        genericLinks: genericLinks,
        zoom: featureInfoZoom,
      },
      geometry: selectedVectorFeature.geometry,
      id: selectedVectorFeature.id,
      showMarker:
        selectedVectorFeature.geometry.type === "Polygon" ||
        selectedVectorFeature.geometry.type === "MultiPolygon",
    };
  }
  return feature;
};

export const getVectorMapping = async (vectorStyles: VectorStyle[]) => {
  let mapping = {};

  const layerPromises = vectorStyles.map(async (vectorStyle, index) => {
    let capabilitiesLayer = "";
    let capabilitiesUrl = "";
    let infoboxMapping: string[] | string = vectorStyle.infoboxMapping || [];

    if (vectorStyle.layer) {
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
            (l) => (l as any).Name === capabilitiesLayer
          );

          if (targetLayer) {
            const extractedCarmaConf = extractCarmaConfig(
              (targetLayer as any).KeywordList
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
      mapping = {
        ...mapping,
        [layerId]: infoboxMapping,
      };
    }
  });

  await Promise.all(layerPromises);

  return mapping;
};

const extractGeoJson = async (geoJson: string) => {
  return await md5FetchJSON("libreGeoJson", geoJson);
};

function convertTo4326(x, y) {
  const lng = (x * 180) / 20037508.34;
  const lat =
    (Math.atan(Math.exp((y * Math.PI) / 20037508.34)) * 360) / Math.PI - 90;
  return [lng, lat];
}

const transformedPois = (pois) => {
  return {
    ...pois,
    features: pois.features.map((feature) => ({
      ...feature,
      geometry: {
        ...feature.geometry,
        // @ts-expect-error
        coordinates: convertTo4326(...feature.geometry.coordinates),
      },
    })),
  };
};

export const vectorStylesToMapLibreStyle = async ({
  layers,
  backgroundStyle,
  clusteringEnabled = true,
}: {
  layers?: LibreLayer[];
  backgroundStyle?: StyleSpecification;
  clusteringEnabled?: boolean;
}): Promise<{
  style: StyleSpecification;
  geoJsonMetadata: Array<{ sourceId: string; uniqueColors: string[] }>;
}> => {
  const defaultSprite = "https://tiles.cismet.de/poi/sprites";
  const customSprites: maplibregl.SpriteSpecification = [];
  const geoJsonMetadata: Array<{ sourceId: string; uniqueColors: string[] }> =
    [];

  // Use provided backgroundStyle or create default
  const baseStyle: StyleSpecification = backgroundStyle || {
    version: 8,
    sources: {
      terrainSource: {
        type: "raster-dem",
        tiles: [
          "https://wuppertal-terrain.cismet.de/services/wupp_dgm_01/tiles/{z}/{x}/{y}.png",
        ],
        tileSize: 512,
        maxzoom: 15,
      },
      "source-amtlich": {
        type: "raster",
        tiles: [
          "https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
        ],
        tileSize: 256,
      },
    },
    layers: [
      {
        id: "layer-amtlich",
        type: "raster",
        source: "source-amtlich",
        paint: { "raster-opacity": 0.9 },
      },
    ],
  };

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
        const response = await fetch(layer.style);
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

          const spriteExists = customSprites.some(
            (sprite) => sprite.id === spriteId
          );
          if (!spriteExists) {
            customSprites.push({
              id: spriteId,
              url: additionalStyle.sprite,
            });
          }
        }
        additionalStyle.layers = additionalStyle.layers.map((styleLayer) => ({
          ...styleLayer,
          id: `${layerId}-${styleLayer.id}`,
          metadata: {
            ...styleLayer.metadata,
            "z-index": index,
            "layer-id": layerId,
          },
          paint: {
            ...styleLayer.paint,
            ...(styleLayer.id.toLowerCase().includes("selection")
              ? {}
              : {
                  [getPaintProperty(styleLayer)]: 1,
                }),
          },
          layout: {
            ...styleLayer.layout,
            ...(styleLayer.layout?.["icon-image"] !== undefined
              ? {
                  "icon-image": [
                    "concat",
                    `${spriteId}:`,
                    styleLayer.layout?.["icon-image"],
                  ],
                }
              : {}),
          },
        }));

        style.sources = { ...style.sources, ...additionalStyle.sources };
        style.layers = [...style.layers, ...additionalStyle.layers];
      } else if (layer.type === "geojson") {
        // Handle geojson layer
        const result = await extractGeoJson(layer.data);
        const transformedData = transformedPois(result);

        const sourceId = `geojson-source-${index}`;

        // Get unique colors from the geojson features
        const uniqueColors: string[] = Array.from(
          new Set(
            (transformedData.features as any[])
              .map((f: any) => f.properties?.schrift)
              .filter((color): color is string => typeof color === "string")
          )
        );

        // Store metadata for pie chart rendering
        geoJsonMetadata.push({ sourceId, uniqueColors });

        // Add the GeoJSON source with optional cluster properties for pie charts
        const sourceConfig: any = {
          type: "geojson",
          data: transformedData,
        };

        if (clusteringEnabled) {
          sourceConfig.cluster = true;
          sourceConfig.clusterMaxZoom = 14;
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
          [sourceId]: sourceConfig,
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

        style.layers = [...style.layers, ...geoJsonLayers];
      }
    });

    await Promise.all(layerPromises);
  }

  if (customSprites.length > 0) {
    style.sprite = customSprites;
  }

  return { style, geoJsonMetadata };
};

export const zoom512as256 = (zoom512: number) => {
  return zoom512 + 1;
};

export const zoom256as512 = (zoom256: number) => {
  return zoom256 - 1;
};
