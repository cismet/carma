import { isNaN } from "lodash";

import type { FeatureInfoProperties, Item, Layer } from "@carma/types";
import { extractCarmaConfig } from "@carma-commons/utils";
import envelope from "@turf/envelope";
import L from "leaflet";
import { sandboxedEvalExternal } from "../components/SandboxedEvalProvider";
import { LeafletMap } from "@carma-mapping/engines/leaflet";

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
    const definedMinzooms = vectorStyles
      .map((s) => s.minzoom)
      .filter((z) => z !== undefined);
    const minzoomVector =
      definedMinzooms.length > 0
        ? Math.min(...definedMinzooms)
        : sourceZoom.minzoom;

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
    let capabilitiesUrl = layer?.props?.url
      ? layer?.props?.url + "service=WMS&request=GetCapabilities&version=1.1.1"
      : undefined;
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
      let metaData = {};
      if (vectorStyle) {
        zoom = await fetch(vectorStyle)
          .then((response) => {
            return response.json();
          })
          .then((result) => {
            const parsedZoom = parseZoom(result.layers, {
              minzoom: 9,
              maxzoom: 24,
            });
            if (result.metadata && result.metadata.carmaConf.layerInfo) {
              metaData = result.metadata.carmaConf.layerInfo;
            }
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
        queryable: !layer.queryable
          ? layer?.keywords?.some((keyword) =>
              keyword.includes("carmaconf://infoBoxMapping")
            )
          : layer.queryable,
        useInFeatureInfo: true,
        visible: visible,
        props: {
          style: vectorStyle,
          minZoom:
            Number(carmaConf?.minZoom) || zoom?.minzoom || layer?.minZoom,
          maxZoom:
            Number(carmaConf?.maxZoom) || zoom?.maxzoom || layer?.maxZoom,
          legend: layer?.props?.Style?.[0].LegendURL,
          metaData: layer?.props?.MetadataURL,
        },
        other: {
          ...Object.fromEntries(
            Object.entries(layer).filter(([key]) => !["props"].includes(key))
          ),
          layerName: layer.name,
          capabilitiesUrl: capabilitiesUrl,
          ...metaData,
        },
      };
    } else {
      switch (layer.layerType) {
        case "wmts-nt":
        case "wmts": {
          newLayer = {
            title: layer.title,
            id: id,
            layerType: layer.layerType,
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
              capabilitiesUrl: capabilitiesUrl,
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
              capabilitiesUrl: capabilitiesUrl,
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

export const zoomToFeature = (
  selectedFeature: any,
  leafletMap: LeafletMap,
  padding: [number, number] = [0, 0]
) => {
  if (
    selectedFeature.properties?.wmsProps?.bounds ||
    selectedFeature.properties?.bounds
  ) {
    const bbox = JSON.parse(
      selectedFeature.properties?.wmsProps?.bounds ??
        selectedFeature.properties?.bounds
    );
    if (leafletMap) {
      leafletMap.fitBounds(
        [
          [bbox[3], bbox[2]],
          [bbox[1], bbox[0]],
        ],
        {
          padding: padding,
        }
      );
    }
  } else if (selectedFeature.geometry) {
    const type = selectedFeature.geometry.type;
    if (type === "Point") {
      const coordinates = getCoordinates(selectedFeature.geometry);

      if (leafletMap) {
        leafletMap.setView(
          [coordinates[1], coordinates[0]],
          selectedFeature.properties.zoom ? selectedFeature.properties.zoom : 20
        );
      }
    } else {
      console.log("xxx", selectedFeature.geometry);
      const bbox = envelope(selectedFeature.geometry).bbox;

      if (leafletMap) {
        leafletMap.fitBounds(
          [
            [bbox[3], bbox[2]],
            [bbox[1], bbox[0]],
          ],
          {
            padding: padding,
          }
        );
      }
    }
  }
};

export const getFunctionRegex = () => {
  return /(function\s*\([^)]*\)\s*\{[^}]*\})|(\([^)]*\)\s*=>\s*[^}]*)/g;
};

export const parseHeader = async (
  header: string,
  properties?: FeatureInfoProperties
) => {
  if (!header) return "";

  if (getFunctionRegex().test(header)) {
    try {
      const result = await sandboxedEvalExternal(
        "(" + header + ")",
        properties
      );
      return (result as any).toString();
    } catch (error) {
      console.error("Error parsing header function:", error);
      return header;
    }
  }

  return header;
};
