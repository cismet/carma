import { isNaN } from "lodash";

import type { FeatureInfoProperties, Item, Layer } from "@carma/types";
import type { Geometry } from "geojson";
import { extractCarmaConfig } from "@carma-commons/utils";
import envelope from "@turf/envelope";
import L from "leaflet";
import { sandboxedEvalExternal } from "@carma-commons/sandbox-eval";
import { LeafletMap } from "@carma-mapping/engines/leaflet";
import localforage from "localforage";

export const getInternetExplorerVersion = () => {
  var rV = -1; // Return value assumes failure.

  if (
    navigator.appName === "Microsoft Internet Explorer" ||
    navigator.appName === "Netscape"
  ) {
    var uA = navigator.userAgent;
    var rE = new RegExp("MSIE ([0-9]{1,}[.0-9]{0,})");

    if (rE.exec(uA) !== null) {
      rV = parseFloat(RegExp.$1);
    } else if (!!navigator.userAgent.match(/Trident.*rv:11\./)) {
      /*check for IE 11*/
      rV = 11;
    }
  }
  return rV;
};

export const setFromLocalforage = async (
  lfKey,
  setter,
  fallbackValue,
  forceFallback
) => {
  const value = await localforage.getItem(lfKey);
  if (value !== undefined && value !== null) {
    setter(value);
  } else if (fallbackValue !== undefined || forceFallback === true) {
    setter(fallbackValue);
  }
};

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

export const getPointsFromGeometry = (geometry: Geometry): number[][] => {
  switch (geometry.type) {
    case "Point":
      return [geometry.coordinates as number[]];
    case "MultiPoint":
      return geometry.coordinates as number[][];
    case "LineString":
      return geometry.coordinates as number[][];
    case "MultiLineString":
      return (geometry.coordinates as number[][][]).flat();
    case "Polygon":
      return (geometry.coordinates as number[][][]).flat();
    case "MultiPolygon":
      return (geometry.coordinates as number[][][][]).flat(2);
    default:
      return [];
  }
};

export const zoomToFeature = ({
  selectedFeature,
  leafletMap,
  libreMap,
  padding = [0, 0],
}: {
  selectedFeature: any;
  leafletMap?: L.Map;
  libreMap?: maplibregl.Map;
  padding?: [number, number];
}) => {
  if (!leafletMap && !libreMap) return;
  if (selectedFeature.properties?.sourceProps?.bounds) {
    const bbox = JSON.parse(selectedFeature.properties.sourceProps.bounds);
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
    } else if (libreMap) {
      libreMap.fitBounds(
        [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ],
        {
          padding: 60,
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
      } else if (libreMap) {
        libreMap.flyTo({
          center: [coordinates[0], coordinates[1]],
          zoom: selectedFeature.properties.zoom
            ? selectedFeature.properties.zoom - 1
            : 19,
          animate: false,
        });
      }
    } else {
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
      } else if (libreMap) {
        libreMap.fitBounds(
          [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[3]],
          ],
          {
            padding: 60,
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
