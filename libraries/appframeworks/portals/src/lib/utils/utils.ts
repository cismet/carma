import { isNaN } from "lodash";

import type { Item, Layer } from "@carma-commons/types";
import { extractCarmaConfig } from "@carma-commons/utils";

export const parseDescription = (description: string) => {
  const result = { inhalt: "", sichtbarkeit: "", nutzung: "" };
  const keywords = ["Inhalt:", "Sichtbarkeit:", "Nutzung:"];

  if (!description) {
    return result;
  }

  function extractTextAfterKeyword(input: string, keyword: string) {
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

export function paramsToObject(entries: URLSearchParams) {
  const result: { [key: string]: string } = {};
  for (const [key, value] of entries) {
    // each 'entry' is a [key, value] tupple
    result[key] = value;
  }
  return result;
}

const parseZoom = (
  vectorStyles: {
    id: string;
    maxzoom: number;
    minzoom: number;
  }[],
  sourceZoom: {
    minzoom: number;
    maxzoom: number;
  }
) => {
  let maxzoom = sourceZoom.maxzoom;
  let minzoom = sourceZoom.minzoom;

  if (vectorStyles.length > 0) {
    const maxzoomVector = vectorStyles.reduce((acc, cur) => {
      if (cur.maxzoom > acc) {
        return cur.maxzoom;
      }
      return acc;
    }, 0);
    const minzoomVector = vectorStyles.reduce((acc, cur) => {
      if (cur.minzoom < acc) {
        return cur.minzoom;
      }
      return acc;
    }, 24);

    maxzoom = Math.max(maxzoom, maxzoomVector);
    minzoom = Math.max(minzoom, minzoomVector);
  }

  return { maxzoom, minzoom };
};

function isJson(str) {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}

export const parseToMapLayer = async (
  layer: Item,
  forceWMS: boolean,
  visible: boolean,
  opacity?: number
) => {
  let newLayer: Layer | null = null;
  const id = layer.id.startsWith("fav_") ? layer.id.slice(4) : layer.id;

  const carmaConf = extractCarmaConfig(layer.keywords);
  if (layer.type === "layer") {
    if ((carmaConf?.vectorStyle && !forceWMS) || layer.vectorStyle) {
      let zoom = {
        minzoom: 9,
        maxzoom: 24,
      };
      let vectorStyle = "";
      if (carmaConf?.vectorStyle) {
        vectorStyle = isJson(carmaConf.vectorStyle)
          ? JSON.parse(carmaConf.vectorStyle as string)
          : carmaConf.vectorStyle;
      } else if (layer.vectorStyle) {
        vectorStyle = layer.vectorStyle;
      }
      if (vectorStyle) {
        zoom = await fetch(vectorStyle)
          .then((response) => {
            return response.json();
          })
          .then((result) => {
            const parsedZoom = parseZoom(
              result.layers.filter((layer) => !layer.id.includes("selection")),
              {
                minzoom: 9,
                maxzoom: 24,
              }
            );
            return parsedZoom;
          });
      }

      newLayer = {
        title: layer.title,
        id: id,
        layerType: "vector",
        opacity: opacity || 1.0,
        description: layer.description,
        conf: carmaConf ?? undefined,
        queryable: isNaN(layer.queryable)
          ? layer?.keywords?.some((keyword) =>
              keyword.includes("carmaconf://infoBoxMapping")
            )
          : layer.queryable,
        useInFeatureInfo: true,
        visible: visible,
        props: {
          style: vectorStyle,
          minZoom: Number(carmaConf?.minZoom) || zoom?.minzoom,
          maxZoom: Number(carmaConf?.maxZoom) || zoom?.maxzoom,
          legend: layer?.props?.Style[0].LegendURL,
          metaData: layer?.props?.MetadataURL,
        },
        other: {
          ...Object.fromEntries(
            Object.entries(layer).filter(([key]) => !["props"].includes(key))
          ),
          layerName: layer.name,
          capabilitiesUrl:
            layer?.props?.url +
            "service=WMS&request=GetCapabilities&version=1.1.1",
        },
      };
    } else {
      switch (layer.layerType) {
        case "wmts": {
          newLayer = {
            title: layer.title,
            id: id,
            layerType: "wmts",
            opacity: opacity || 1.0,
            description: layer.description,
            conf: carmaConf!,
            visible: visible,
            queryable: layer.queryable,
            useInFeatureInfo: true,
            props: {
              url: (carmaConf?.source as string) || layer.props.url,
              legend: layer.props.Style?.[0].LegendURL,
              name: (carmaConf?.sourceLayer as string) || layer.props.Name,
              maxZoom: layer.maxZoom,
              minZoom: layer.minZoom,
              featureInfoUrl: layer.props.url,
              featureInfoName: layer.props.Name,
              metaData: layer.props.MetadataURL,
            },
            other: {
              ...Object.fromEntries(
                Object.entries(layer).filter(
                  ([key]) => !["props"].includes(key)
                )
              ),
              layerName: layer.name,
              capabilitiesUrl:
                layer?.props?.url +
                "service=WMS&request=GetCapabilities&version=1.1.1",
            },
          };
          break;
        }
        case "vector": {
          newLayer = {
            title: layer.title,
            id: id,
            layerType: "vector",
            opacity: 1.0,
            description: layer.description,
            conf: carmaConf!,
            queryable: isNaN(layer.queryable)
              ? layer?.keywords?.some((keyword) =>
                  keyword.includes("carmaconf://infoBoxMapping")
                )
              : layer.queryable,
            useInFeatureInfo: true,
            visible: visible,
            props: {
              style: layer.props.style ? layer.props.style : "",
              legend: layer.props.Style[0].LegendURL,
              metaData: layer.props.MetadataURL,
            },
            other: {
              ...Object.fromEntries(
                Object.entries(layer).filter(
                  ([key]) => !["props"].includes(key)
                )
              ),
              layerName: layer.name,
              capabilitiesUrl:
                layer?.props?.url +
                "service=WMS&request=GetCapabilities&version=1.1.1",
            },
          };
          break;
        }
      }
    }
  }

  // Check if newLayer was assigned and throw an error if not
  if (newLayer === null) {
    throw new Error(`Could not parse layer ${layer.id} to map layer.`);
  }
  return newLayer;
};
