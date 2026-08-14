/* eslint-disable @typescript-eslint/no-explicit-any */
import type { WMSCapabilitiesJSON } from "wms-capabilities";
import type {
  ExtendedItem,
  InteractionButton,
  Item,
  XMLLayer,
  Layer,
} from "../lib/contracts/carma-layers.d";

import { serviceConfig } from "./config";

/**
 * Whether a link item's url leaves the app: absolute http(s) urls open in a
 * new tab, everything else (e.g. "#/gesundheit" hash routes) navigates in
 * place.
 */
export const isExternalUrl = (url?: string): boolean =>
  !!url && /^https?:/i.test(url);

/**
 * Navigate to an internal hash link (e.g. "#/gesundheit"), carrying the
 * current hash query over: hash-router apps keep state like the map position
 * in those params, and a plain href would wipe it.
 */
export const navigateToInternalHashLink = (url: string) => {
  const [targetPath, targetQuery] = url.replace(/^#/, "").split("?");
  const currentQuery = window.location.hash.split("?")[1];
  const query = targetQuery ?? currentQuery;
  window.location.hash = query ? `${targetPath}?${query}` : targetPath;
};

export const getInteractionButtons = (
  buttons?: InteractionButton | InteractionButton[]
): InteractionButton[] => {
  if (!buttons) return [];
  return Array.isArray(buttons) ? buttons : [buttons];
};

export const reorderLayersByInsertRules = <T extends { id: string }>(
  layers: T[]
): T[] => {
  let result = [...layers];

  const layersWithInsertAfterId = result.filter(
    (layer) =>
      (layer as any).insertAfterId &&
      typeof (layer as any).insertPosition !== "number"
  );

  if (layersWithInsertAfterId.length > 0) {
    // Remove layers with insertAfterId from their current positions
    result = result.filter(
      (layer) =>
        !(layer as any).insertAfterId ||
        typeof (layer as any).insertPosition === "number"
    );

    layersWithInsertAfterId.forEach((layer) => {
      const insertAfterId = (layer as any).insertAfterId;
      const targetIndex = result.findIndex((l) => l.id === insertAfterId);
      if (targetIndex !== -1) {
        result.splice(targetIndex + 1, 0, layer);
      } else {
        // If id doesn't exist append to the end
        result.push(layer);
      }
    });
  }

  const layersWithInsertPosition = result.filter(
    (layer) => typeof (layer as any).insertPosition === "number"
  );

  if (layersWithInsertPosition.length > 0) {
    result = result.filter(
      (layer) => typeof (layer as any).insertPosition !== "number"
    );

    // Settle lower indices first so higher ones land after them
    layersWithInsertPosition
      .sort((a, b) => (a as any).insertPosition - (b as any).insertPosition)
      .forEach((layer) => {
        const targetIndex = Math.max(
          0,
          Math.min((layer as any).insertPosition, result.length)
        );
        result.splice(targetIndex, 0, layer);
      });
  }

  return result;
};

export const HINT_TITLE = "Hinweis";

export const parseDescription = (description: string) => {
  if (!description) {
    return [];
  }

  const results: { title: string; description: string }[] = [];

  // Define the list of possible titles to look for
  const possibleTitles = [
    "Inhalt",
    "Beschreibung",
    "Sichtbarkeit",
    "Nutzung",
    "Verwendungszweck",
    HINT_TITLE,
    "Implementierung",
  ];

  const titleMatches: { title: string; fullMatch: string; position: number }[] =
    [];

  // Find all occurrences of each possible title in the description
  for (const title of possibleTitles) {
    const titleWithColon = `${title}:`;
    let startPos = 0;
    let pos: number;

    while ((pos = description.indexOf(titleWithColon, startPos)) !== -1) {
      titleMatches.push({
        title: title,
        fullMatch: titleWithColon,
        position: pos,
      });
      startPos = pos + titleWithColon.length;
    }
  }

  titleMatches.sort((a, b) => a.position - b.position);

  if (titleMatches.length === 0) {
    return [{ title: "Inhalt", description: description.trim() }];
  }

  // Check if there's text before the first title match
  const firstMatchPosition = titleMatches[0].position;
  let unmatchedTextAtStart = "";
  if (firstMatchPosition > 0) {
    unmatchedTextAtStart = description.substring(0, firstMatchPosition).trim();
  }

  // Process each title and extract its description
  for (let i = 0; i < titleMatches.length; i++) {
    const currentMatch = titleMatches[i];
    const currentTitle = currentMatch.fullMatch;
    const titleWithoutColon = currentMatch.title;

    const titleStartPos = currentMatch.position;

    let nextTitleStartPos = description.length;
    if (i < titleMatches.length - 1) {
      nextTitleStartPos = titleMatches[i + 1].position;
    }

    const descriptionText = description
      .substring(titleStartPos + currentTitle.length, nextTitleStartPos)
      .trim();

    if (titleWithoutColon === HINT_TITLE && !descriptionText) {
      continue;
    }

    results.push({
      title: titleWithoutColon,
      description: descriptionText,
    });
  }

  if (unmatchedTextAtStart && titleMatches.length > 1) {
    const inhaltIndex = results.findIndex((item) => item.title === "Inhalt");

    if (inhaltIndex !== -1) {
      results[inhaltIndex].description =
        unmatchedTextAtStart + "\n\n" + results[inhaltIndex].description;
    } else {
      results.unshift({
        title: "Inhalt",
        description: unmatchedTextAtStart,
      });
    }
  }

  return results;
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
    KeywordList: layer.KeywordList,
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
      const object = { ...vectorObject, [property]: value };
      vectorObject = object;
    }
  });

  return vectorObject;
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

export const wmsLayerToGenericItem = (
  layer: XMLLayer,
  serviceName: string,
  path?: string
) => {
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
      maxZoom: scaleHintToZoom(layer?.ScaleHint?.min) || 24,
      minZoom: scaleHintToZoom(layer?.ScaleHint?.max) || 0,
      props: { ...layer },
      serviceName: serviceName,
      path: path ? path : "",
    };

    return item;
  } else {
    return null;
  }
};

export const hasHideLayerKeyword = (keywords?: string[]) => {
  return (
    keywords?.some((keyword) => keyword.includes("carmaconf://hideLayer")) ??
    false
  );
};

export const applyKeywordSettings = <T extends Item>(layer: T): T => {
  let infoBoxMapping = "";
  let thumbnail = "";

  layer.keywords?.forEach((keyword) => {
    const extracted = keyword.split("carmaconf://infoBoxMapping:")[1];
    const foundThumbnail = keyword.split("carmaConf://thumbnail:")[1];

    if (foundThumbnail) {
      thumbnail = foundThumbnail;
    }

    if (extracted) {
      infoBoxMapping += extracted + "\n";
    }
  });

  const updatedLayer = {
    ...layer,
    queryable: infoBoxMapping ? true : false,
  } as T;

  if (thumbnail) {
    updatedLayer.thumbnail = thumbnail;
  }

  return updatedLayer;
};

export const normalizeObject = (obj: any): any => {
  if (!obj || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => normalizeObject(item));
  }

  const normalized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    // Skip undefined values
    if (value === undefined) continue;

    normalized[key] = normalizeObject(value);
  }
  return normalized;
};

export const getLayerStructure = ({
  config,
  wms,
  serviceName,
  skipTopicMaps,
  replaceLayers,
}: {
  config: any;
  wms?: WMSCapabilitiesJSON;
  serviceName: string;
  skipTopicMaps?: boolean;
  replaceLayers?: ExtendedItem[];
}) => {
  const structure: {
    Title: string;
    layers: Item[];
  }[] = [];
  const services = serviceConfig;
  for (let category in config) {
    if (category === "TopicMaps" && skipTopicMaps) {
      continue;
    }
    const categoryConfig = config[category];
    const layers: Item[] = [];
    let categoryObject = {
      Title: categoryConfig.Title || category,
      id: categoryConfig.serviceName,
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
          foundLayer = wmsLayerToGenericItem(
            wmsLayer,
            serviceName,
            categoryObject.Title
          );
        } else {
          foundLayer = { ...layer, path: categoryObject.Title };
        }
        if (foundLayer) {
          let replace = false;
          let merge = false;
          replaceLayers?.forEach((replaceLayer) => {
            if (replaceLayer.replaceId === foundLayer?.id) {
              replace = true;
            } else if (replaceLayer.mergeId === foundLayer?.id) {
              merge = true;
            }
          });
          if (wms) {
            // @ts-expect-error fix typing
            foundLayer.props["url"] =
              wms.Capability.Request.GetMap.DCPType[0].HTTP.Get.OnlineResource;
          }
          let tags = foundLayer.tags || [];
          let keywords = foundLayer.keywords;
          if (hasHideLayerKeyword(keywords)) {
            continue;
          }
          tags[0] =
            foundLayer.type === "link"
              ? foundLayer.tags?.[0]
              : categoryObject.Title;
          foundLayer = { ...foundLayer, ...layer, tags, service };
          if (keywords && foundLayer?.keywords) {
            foundLayer.keywords = Array.from(
              new Set([...keywords, ...foundLayer.keywords])
            );
          }

          if (foundLayer) {
            foundLayer = applyKeywordSettings(foundLayer);

            if (replace || merge) {
              let newLayer = replaceLayers?.find(
                (layer) =>
                  layer.replaceId === foundLayer?.id ||
                  layer.mergeId === foundLayer?.id
              );
              if (newLayer) {
                if (merge) {
                  newLayer = mergeLayers(newLayer, foundLayer);
                }
                layers.push({
                  ...newLayer,
                  serviceName: service.name,
                });
              }
              continue;
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
        let foundLayer = wmsLayerToGenericItem(
          wmsLayer,
          serviceName,
          categoryObject.Title
        );
        if (foundLayer) {
          foundLayer.props["url"] =
            wms.Capability.Request.GetMap.DCPType[0].HTTP.Get.OnlineResource;

          let tags = foundLayer.tags || [];
          tags[0] = categoryObject.Title;
          foundLayer = {
            ...foundLayer,
            ...layer,
            tags,
            // @ts-ignore
            service: services[categoryConfig.serviceName as string],
          };

          if (foundLayer) {
            foundLayer = applyKeywordSettings(foundLayer);
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
      mergedObj[obj.Title] = { Title: obj.Title, layers: [], id: obj.id };
    }
    mergedObj[obj.Title].layers.push(...obj.layers);
  });

  structure2.forEach((obj: any) => {
    if (!mergedObj[obj.Title]) {
      mergedObj[obj.Title] = { Title: obj.Title, layers: [], id: obj.id };
    }
    mergedObj[obj.Title].layers.push(...obj.layers);
  });

  let mergedArray = Object.values(mergedObj);
  return mergedArray;
};

const mergeLayers = (layer1: ExtendedItem, layer2: Item) => {
  if (layer1.type !== "layer" || layer2.type !== "layer") {
    return layer2;
  }
  const mergedLayer = { ...layer2 };

  const mergedProps = deepMergeProps(layer1.props || {}, layer2.props || {});

  for (const key in layer1) {
    if (key !== "keywords" && key !== "props") {
      mergedLayer[key] = layer1[key];
    }
  }

  mergedLayer.props = mergedProps;

  const keywords1 = layer1.keywords || [];
  const keywords2 = layer2.keywords || [];

  const carmaConfMap: Record<string, string> = {};

  keywords2.forEach((keyword) => {
    let lowerKeyword = keyword.toLowerCase();
    if (lowerKeyword.startsWith("carmaconf://")) {
      const withoutProtocol = lowerKeyword.startsWith("carmaconf://")
        ? keyword.substring(11)
        : keyword.substring(12);

      const colonIndex = withoutProtocol.indexOf(":");
      const identifier =
        colonIndex !== -1
          ? withoutProtocol.substring(0, colonIndex).toLowerCase()
          : withoutProtocol.toLowerCase();

      carmaConfMap[identifier] = keyword;
    }
  });

  keywords1.forEach((keyword) => {
    let lowerKeyword = keyword.toLowerCase();
    if (lowerKeyword.startsWith("carmaconf://")) {
      const withoutProtocol = lowerKeyword.startsWith("carmaconf://")
        ? keyword.substring(11)
        : keyword.substring(12);

      const colonIndex = withoutProtocol.indexOf(":");
      const identifier =
        colonIndex !== -1
          ? withoutProtocol.substring(0, colonIndex).toLowerCase()
          : withoutProtocol.toLowerCase();

      carmaConfMap[identifier] = keyword;
    }
  });

  const mergedKeywords = [
    ...keywords2.filter((keyword) => {
      const lowerKeyword = keyword.toLowerCase();
      return !lowerKeyword.startsWith("carmaconf://");
    }),
    ...keywords1.filter((keyword) => {
      const lowerKeyword = keyword.toLowerCase();
      return !lowerKeyword.startsWith("carmaconf://");
    }),
    ...Object.values(carmaConfMap),
  ];

  mergedLayer.keywords = mergedKeywords;

  return mergedLayer;
};

/**
 * Helper function to merge props objects
 * Properties from props1 completely replace properties from props2 when they exist
 */
const deepMergeProps = (props1: any, props2: any): any => {
  if (typeof props1 !== "object" || props1 === null) {
    return props1;
  }

  if (typeof props2 !== "object" || props2 === null) {
    return props1;
  }

  const result = { ...props2 };

  for (const key in props1) {
    if (Object.prototype.hasOwnProperty.call(props1, key)) {
      if (
        key in result &&
        typeof result[key] === "object" &&
        typeof props1[key] === "object" &&
        !Array.isArray(result[key]) &&
        !Array.isArray(props1[key])
      ) {
        result[key] = deepMergeProps(props1[key], result[key]);
      } else {
        result[key] = props1[key];
      }
    }
  }

  return result;
};

export const findLayerAndAddTags = (
  layer: any,
  name: string,
  tagsToAdd: string[]
) => {
  if (layer.Name === name) {
    return { ...layer, tags: [...tagsToAdd] };
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
