/* eslint-disable @typescript-eslint/no-explicit-any */
import type { WMSCapabilitiesJSON } from "wms-capabilities";
import { serviceConfig } from "./config";
import type { Item, XMLLayer, Layer, Config } from "./types";

export const parseDescription = (description: string) => {
  const result = { inhalt: "", sichtbarkeit: "", nutzung: "" };
  const keywords = ["Inhalt:", "Sichtbarkeit:", "Nutzung:"];

  if (!description) {
    return result;
  }

  function extractTextAfterKeyword(input, keyword) {
    const index = input.indexOf(keyword);
    if (index !== -1) {
      const startIndex = index + keyword.length;
      let endIndex = input.length;
      for (const nextKeyword of keywords) {
        const nextIndex = input.indexOf(nextKeyword, startIndex);
        if (nextIndex !== -1 && nextIndex < endIndex) {
          endIndex = nextIndex;
        }
      }
      return input.slice(startIndex, endIndex).trim();
    }
    return "";
  }

  result.inhalt = extractTextAfterKeyword(description, "Inhalt:");
  result.sichtbarkeit = extractTextAfterKeyword(description, "Sichtbarkeit:");
  result.nutzung = extractTextAfterKeyword(description, "Nutzung:");

  return result;
};

export const flattenLayer = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layer: any,
  parentTitles: string[] = [],
  url: string
) => {
  const layerTitle = layer.Title as string;
  const layerTags = [...parentTitles, layerTitle];

  const flattenedLayer: any = {
    Title: layerTitle,
    Name: layer.Name ? layer.Name : "",
    Abstract: layer.Abstract,
    tags: layerTags,
    srs: layer.SRS,
    BoundingBox: layer.BoundingBox,
    LatLonBoundingBox: layer.LatLonBoundingBox,
    style: layer.Style,
    noSubsets: layer.noSubsets,
    opaque: layer.opaque,
    queryable: layer.queryable,
    url,
  };

  if (layer.Layer) {
    const childLayers: any[] = [];
    layer.Layer.forEach((subLayer: any) => {
      const flattennedSubLayer = flattenLayer(subLayer, layerTags, url);
      if (flattennedSubLayer?.layers) {
        childLayers.push(...flattennedSubLayer.layers);
        delete flattennedSubLayer.layers;
      }
      if (flattennedSubLayer.Name !== "") {
        childLayers.push(flattennedSubLayer);
      }
    });
    flattenedLayer.layers = childLayers;
  }

  return flattenedLayer;
};

export const extractVectorStyles = (keywords: string[]) => {
  let vectorObject: any = null;
  keywords.forEach((keyword) => {
    if (keyword.startsWith("carmaConf://")) {
      const objectString = keyword.slice(12);
      let colonIndex = objectString.indexOf(":");
      const property = objectString.split(":")[0];
      let value =
        colonIndex !== -1 ? objectString.substring(colonIndex + 1).trim() : "";
      const object = { [property]: value };
      vectorObject = object;
    }
  });

  return vectorObject;
};

export const createBaseConfig = (layers: XMLLayer[]) => {
  const result: Record<string, Item[]> = {};
  layers.forEach((item) => {
    result[item.Title] = {
      // @ts-ignore
      layers: item.layers.map((layer) => ({ name: layer.Name })),
    };
  });
  console.log(result);

  return null;
};

const getLeafLayers = (layer: any, leafLayers: Layer[] = []) => {
  // Check if the layer has sub-layers
  if (layer.Layer && Array.isArray(layer.Layer) && layer.Layer.length > 0) {
    // Recursively check each sub-layer
    layer.Layer.forEach((subLayer: any) => getLeafLayers(subLayer, leafLayers));
  } else {
    // If no sub-layers, it's a leaf layer, add it to the list
    leafLayers.push(layer);
  }
  return leafLayers;
};

export const getAllLeafLayers = (capabilities: WMSCapabilitiesJSON) => {
  const rootLayer = capabilities.Capability.Layer;
  return getLeafLayers(rootLayer);
};

export const findDifferences = (array1: XMLLayer[], array2: Item[]) => {
  const missingInConfig = array1.filter(
    (layer1) => !array2.some((layer2) => layer2.name === layer1.Name)
  );

  return {
    missingInConfig,
  };
};

const scaleHintToZoom = (scaleHint: number) => {
  if (!scaleHint) {
    return undefined;
  }

  const C = 156543.03;

  const zoom = Math.log2(C / scaleHint);

  return Math.round(zoom);
};

const wmsLayerToGenericItem = (layer: XMLLayer, serviceName: string) => {
  if (layer) {
    let item: Item = {
      title: layer.Title,
      description: layer.Abstract,
      tags: layer.tags,
      keywords: layer.KeywordList,
      id: serviceName + ":" + layer.Name,
      name: layer.Name,
      type: "layer",
      layerType: "wmts",
      queryable: layer.queryable,
      maxZoom: scaleHintToZoom(layer?.ScaleHint?.min),
      minZoom: scaleHintToZoom(layer?.ScaleHint?.max),
      props: { ...layer },
    };

    return item;
  } else {
    return null;
  }
};

export const getLayerStructure = ({
  config,
  wms,
  serviceName,
}: {
  config: any;
  wms?: WMSCapabilitiesJSON;
  serviceName: string;
}) => {
  const structure: {
    Title: string;
    layers: Item[];
  }[] = [];
  const services = serviceConfig;
  for (let category in config) {
    const categoryConfig = config[category];
    const layers: Item[] = [];
    let categoryObject = {
      Title: categoryConfig.Title || category,
      layers,
    };

    for (let layerIndex in categoryConfig.layers) {
      const layer = categoryConfig.layers[layerIndex];
      let service;
      if (layer.serviceName) {
        service = services[layer.serviceName];
      } else {
        service = services[categoryConfig.serviceName];
      }
      if (service.name === serviceName) {
        let foundLayer: Item | null;
        if (wms) {
          const wmsLayer = findLayerAndAddTags(
            wms.Capability.Layer,
            layer.name,
            []
          );
          foundLayer = wmsLayerToGenericItem(wmsLayer, serviceName);
        } else {
          foundLayer = layer;
        }
        if (foundLayer) {
          if (wms) {
            // @ts-expect-error fix typing
            foundLayer.props["url"] =
              wms.Capability.Request.GetMap.DCPType[0].HTTP.Get.OnlineResource;
          }
          let tags = foundLayer.tags;
          let keywords = foundLayer.keywords;
          tags[0] =
            foundLayer.type === "link"
              ? foundLayer.tags[0]
              : categoryObject.Title;
          foundLayer = { ...foundLayer, ...layer, tags, service };
          if (keywords && foundLayer?.keywords) {
            foundLayer.keywords = [...keywords, ...foundLayer.keywords];
          }

          let infoBoxMapping = "";
          let thumbnail = "";

          foundLayer?.keywords?.forEach((keyword) => {
            const extracted = keyword.split("carmaconf://infoBoxMapping:")[1];
            const foundThumbnail = keyword.split("carmaConf://thumbnail:")[1];

            if (foundThumbnail) {
              thumbnail = foundThumbnail;
            }

            if (extracted) {
              infoBoxMapping += extracted + "\n";
            }
          });

          if (foundLayer) {
            if (!infoBoxMapping) {
              foundLayer = {
                ...foundLayer,
                queryable: false,
              };
            }

            if (thumbnail) {
              foundLayer.thumbnail = thumbnail;
            }
            layers.push(foundLayer);
          }
        }
      }
    }

    if (wms && serviceName === services[categoryConfig.serviceName].name) {
      const missingInConfig = findDifferences(
        // @ts-ignore
        getAllLeafLayers(wms),
        categoryConfig.layers
      );

      for (const layer of missingInConfig.missingInConfig) {
        const wmsLayer = findLayerAndAddTags(
          wms.Capability.Layer,
          layer.Name,
          []
        );
        let foundLayer = wmsLayerToGenericItem(wmsLayer, serviceName);
        if (foundLayer) {
          foundLayer.props["url"] =
            wms.Capability.Request.GetMap.DCPType[0].HTTP.Get.OnlineResource;

          let tags = foundLayer.tags;
          tags[0] = categoryObject.Title;
          foundLayer = {
            ...foundLayer,
            ...layer,
            tags,
            // @ts-ignore
            service: services[categoryConfig.serviceName as string],
          };

          let infoBoxMapping = "";
          let thumbnail = "";

          foundLayer?.keywords?.forEach((keyword) => {
            const extracted = keyword.split("carmaconf://infoBoxMapping:")[1];
            const foundThumbnail = keyword.split("carmaConf://thumbnail:")[1];

            if (foundThumbnail) {
              thumbnail = foundThumbnail;
            }

            if (extracted) {
              infoBoxMapping += extracted + "\n";
            }
          });

          if (foundLayer) {
            if (!infoBoxMapping) {
              foundLayer = {
                ...foundLayer,
                queryable: false,
              };
            }

            if (thumbnail) {
              foundLayer.thumbnail = thumbnail;
            }
            layers.push(foundLayer);
          }
        }
      }
    }

    categoryObject.layers = layers;
    structure.push(categoryObject);
  }

  return structure;
};

export const mergeStructures = (structure1: any, structure2: any) => {
  let mergedObj: Record<string, any> = {};

  structure1.forEach((obj: any) => {
    if (!mergedObj[obj.Title]) {
      mergedObj[obj.Title] = { Title: obj.Title, layers: [] };
    }
    mergedObj[obj.Title].layers.push(...obj.layers);
  });

  structure2.forEach((obj: any) => {
    if (!mergedObj[obj.Title]) {
      mergedObj[obj.Title] = { Title: obj.Title, layers: [] };
    }
    mergedObj[obj.Title].layers.push(...obj.layers);
  });

  let mergedArray = Object.values(mergedObj);
  return mergedArray;
};

export const findLayerAndAddTags = (
  layer: any,
  name: string,
  tagsToAdd: string[]
) => {
  if (layer.Name === name) {
    if (!layer.Tags) {
      layer.tags = [];
    }
    layer.tags.push(...tagsToAdd);
    return layer;
  }
  if (layer.Layer) {
    for (const subLayer of layer.Layer) {
      const foundLayer: any = findLayerAndAddTags(subLayer, name, [
        ...tagsToAdd,
        layer.Title,
      ]);
      if (foundLayer) {
        return foundLayer;
      }
    }
  }
  return null;
};

export const customCategoryToLayers = (config) => {
  const layers: any[] = [];
  config.layers.forEach((layer) => {
    let keywords: string[] = [];
    if (layer.keywords) {
      keywords = layer.keywords;
    }
    if (config.keywords) {
      keywords = [...keywords, ...config.keywords];
    }
    layers.push({
      ...layer,
      keywords,
    });
  });

  return layers;
};
