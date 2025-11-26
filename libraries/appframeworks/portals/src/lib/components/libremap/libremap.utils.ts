import { type StyleSpecification, type LayerSpecification } from "maplibre-gl";
import slugify from "slugify";
import WMSCapabilities from "wms-capabilities";
import { VectorStyle } from "../CarmaMap";
import { getAllLeafLayers } from "@carma-mapping/layers";
import { extractCarmaConfig } from "@carma-commons/utils";
// import type { Layer, Layer2, Layer3 } from "wms-capabilities";

// TODO: fix interface
// @ts-expect-error tbd
const parser = new WMSCapabilities();

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

export const vectorStylesToMapLibreStyle = async (
  vectorStyles: VectorStyle[],
  backgroundStyle?: StyleSpecification
) => {
  const defaultSprite = "https://tiles.cismet.de/poi/sprites";
  const customSprites: maplibregl.SpriteSpecification = [];

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

  const layerPromises = vectorStyles.map(async (vectorStyle, index) => {
    const response = await fetch(vectorStyle.style);
    const additionalStyle = await response.json();
    let capabilitiesLayer = "";

    if (vectorStyle.layer) {
      const atIdx = vectorStyle.layer.indexOf("@");
      capabilitiesLayer = vectorStyle.layer.substring(0, atIdx);
    }

    const layerId = capabilitiesLayer || vectorStyle.name;
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
  });

  await Promise.all(layerPromises);

  if (customSprites.length > 0) {
    style.sprite = customSprites;
  }

  return style;
};
