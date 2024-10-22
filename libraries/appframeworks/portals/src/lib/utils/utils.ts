import clsx from "clsx";
import { twMerge } from "tailwind-merge";

import { md5FetchText } from "react-cismap/tools/fetching";
import { getGazDataForTopicIds } from "react-cismap/tools/gazetteerHelper";

import { ENDPOINT } from "@carma-mapping/fuzzy-search";
import { Item, Layer } from "@carma-mapping/layers";
import { extractCarmaConf } from "./carmaConfig";
import { isNaN } from "lodash";

const buildHostUri = (host: string, endpoint: ENDPOINT, crs: string) => {
  return `${host}/data/${crs}/${endpoint}.json`;
};

export const getGazData = async (
  host: string,
  {
    crs = "3857",
    prefix = "GazData",
    endpoints = [
      ENDPOINT.ADRESSEN,
      ENDPOINT.BEZIRKE,
      ENDPOINT.QUARTIERE,
      ENDPOINT.POIS,
      ENDPOINT.KITAS,
    ],
  }: {
    crs?: string;
    prefix?: string;
    endpoints?: ENDPOINT[];
  } = {},
) => {
  const sources: Record<ENDPOINT, string> = Object.fromEntries(
    await Promise.all(
      endpoints.map(async (endpoint) => [
        endpoint,
        await md5FetchText(prefix, buildHostUri(host, endpoint, crs)),
      ]),
    ),
  );
  return getGazDataForTopicIds(sources, endpoints);
};

export function cn(...inputs: string[]) {
  return twMerge(clsx(inputs));
}

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
  },
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
      if (cur.minzoom > acc) {
        return cur.minzoom;
      }
      return acc;
    }, 0);

    maxzoom = Math.max(maxzoom, maxzoomVector);
    minzoom = Math.max(minzoom, minzoomVector);
  }

  return { maxzoom, minzoom };
};

export const parseToMapLayer = async (
  layer: Item,
  forceWMS: boolean,
  opacity?: number,
) => {
  let newLayer: Layer;
  const id = layer.id.startsWith("fav_") ? layer.id.slice(4) : layer.id;

  const carmaConf = extractCarmaConf(layer.keywords);
  if (layer.type === "layer") {
    if (carmaConf?.vectorStyle && !forceWMS) {
      const zoom = await fetch(carmaConf.vectorStyle)
        .then((response) => {
          return response.json();
        })
        .then((result) => {
          const parsedZoom = parseZoom(
            result.layers.filter(
              (layer) =>
                !layer.id.includes("selection") &&
                !layer.id.toLowerCase().includes("label") &&
                !layer.id.toLowerCase().includes("beschriftung"),
            ),
            {
              minzoom:
                result.sources["poi-source"]?.minzoom ||
                result.sources["vector-tiles"]?.minzoom ||
                9,
              maxzoom:
                result.sources["poi-source"]?.maxzoom ||
                result.sources["vector-tiles"]?.maxzoom ||
                24,
            },
          );
          return parsedZoom;
        });
      newLayer = {
        title: layer.title,
        id: id,
        layerType: "vector",
        opacity: opacity || 1.0,
        description: layer.description,
        conf: carmaConf,
        queryable: isNaN(layer.queryable)
          ? layer?.keywords?.some((keyword) =>
              keyword.includes("carmaconf://infoBoxMapping"),
            )
          : layer.queryable,
        useInFeatureInfo: true,
        visible: true,
        props: {
          style: carmaConf.vectorStyle,
          minZoom: Number(carmaConf.minZoom) || zoom?.minzoom,
          maxZoom: zoom?.maxzoom,
          legend: layer.props.Style[0].LegendURL,
        },
        other: {
          ...layer,
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
            visible: true,
            queryable: layer.queryable,
            useInFeatureInfo: true,
            props: {
              url: layer.props.url,
              legend: layer.props.Style[0].LegendURL,
              name: layer.props.Name,
              maxZoom: layer.maxZoom,
              minZoom: layer.minZoom,
            },
            other: {
              ...layer,
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
                  keyword.includes("carmaconf://infoBoxMapping"),
                )
              : layer.queryable,
            useInFeatureInfo: true,
            visible: true,
            props: {
              style: layer.props.style ? layer.props.style : "",
              legend: layer.props.Style[0].LegendURL,
            },
            other: {
              ...layer,
            },
          };
          break;
        }
      }
    }
  }

  // @ts-ignore
  return newLayer;
};
