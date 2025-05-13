import proj4 from "proj4";
import type { Map } from "leaflet";
import type { LayerProps } from "@carma-commons/types";
import { FeatureInfoIcon } from "./FeatureInfoIcon";
import { proj4crs3857def } from "../../helper/gisHelper";

export const getLeafNodes = (node, result: any = {}): any => {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const children = Array.from(node.children);
    if (children.length === 0) {
      // It's a leaf node
      result[node.nodeName] = node.textContent;
    } else {
      // Recursively find leaf nodes in children
      children.forEach((child) => getLeafNodes(child, result));
    }
  }
  return result;
};

export const truncateString = (text: string, num: number) => {
  if (text.length > num) {
    return text.slice(0, num) + "...";
  }
  return text;
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

export const createUrl = ({
  baseUrl,
  layerName,
  viewportBbox,
  viewportWidth,
  viewportHeight,
  x,
  y,
}: {
  baseUrl: string;
  layerName: string;
  viewportBbox: { left: number; bottom: number; right: number; top: number };
  viewportWidth: number;
  viewportHeight: number;
  x: number;
  y: number;
}) => {
  const url =
    baseUrl +
    `?SERVICE=WMS&request=GetFeatureInfo&format=image%2Fpng&transparent=true&version=1.1.1&tiled=true&srs=EPSG%3A3857&BBOX=` +
    `${viewportBbox.left},` +
    `${viewportBbox.bottom},` +
    `${viewportBbox.right},` +
    `${viewportBbox.top}` +
    `&WIDTH=${viewportWidth}&HEIGHT=${viewportHeight}&FEATURE_COUNT=99&LAYERS=${layerName}&QUERY_LAYERS=${layerName}&X=${x}&Y=${y}`;

  return url;
};

export const getFeatureForLayer = async (
  layer,
  pos: number[],
  coordinates: number[],
  map: Map | maplibregl.Map,
  signal?: AbortSignal
) => {
  const props = layer.props as LayerProps;
  const minimalBoxSize = 1;

  let viewportBbox = {
    left: pos[0] - minimalBoxSize,
    bottom: pos[1] - minimalBoxSize,
    right: pos[0] + minimalBoxSize,
    top: pos[1] + minimalBoxSize,
  };
  let viewportWidth = 10;
  let viewportHeight = 10;

  if (map) {
    if (
      "getBounds" in map &&
      typeof map.getBounds === "function" &&
      "getSize" in map &&
      typeof map.getSize === "function"
    ) {
      // Leaflet map
      const bounds = map.getBounds();
      const projectedNE = proj4(
        proj4.defs("EPSG:4326") as unknown as string,
        proj4crs3857def,
        [bounds.getNorthEast().lng, bounds.getNorthEast().lat]
      );
      const projectedSW = proj4(
        proj4.defs("EPSG:4326") as unknown as string,
        proj4crs3857def,
        [bounds.getSouthWest().lng, bounds.getSouthWest().lat]
      );

      viewportBbox = {
        left: projectedSW[0],
        bottom: projectedSW[1],
        right: projectedNE[0],
        top: projectedNE[1],
      };

      viewportWidth = map.getSize().x;
      viewportHeight = map.getSize().y;
    } else if ("getBounds" in map && typeof map.getBounds === "function") {
      // MapLibre map
      const bounds = map.getBounds();
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();

      const projectedNE = proj4(
        proj4.defs("EPSG:4326") as unknown as string,
        proj4crs3857def,
        [ne.lng, ne.lat]
      );
      const projectedSW = proj4(
        proj4.defs("EPSG:4326") as unknown as string,
        proj4crs3857def,
        [sw.lng, sw.lat]
      );

      viewportBbox = {
        left: projectedSW[0],
        bottom: projectedSW[1],
        right: projectedNE[0],
        top: projectedNE[1],
      };

      const container = map.getContainer();
      viewportWidth = container.clientWidth;
      viewportHeight = container.clientHeight;
    }
  }

  const pixelX = Math.round(
    ((pos[0] - viewportBbox.left) / (viewportBbox.right - viewportBbox.left)) *
      viewportWidth
  );
  const pixelY = Math.round(
    ((viewportBbox.top - pos[1]) / (viewportBbox.top - viewportBbox.bottom)) *
      viewportHeight
  );

  const featureInfoUrl = props.featureInfoUrl || props.url;
  const featureInfoName = props.featureInfoName || props.name;

  const url = createUrl({
    baseUrl: featureInfoUrl.includes("https")
      ? featureInfoUrl
      : featureInfoUrl.replace("http", "https"),
    layerName: featureInfoName,
    viewportBbox,
    viewportWidth,
    viewportHeight,
    x: pixelX,
    y: pixelY,
  });

  const legacyFeatureInfoUrl =
    featureInfoUrl +
    `&VERSION=1.1.1&REQUEST=GetFeatureInfo&BBOX=` +
    `${viewportBbox.left},` +
    `${viewportBbox.bottom},` +
    `${viewportBbox.right},` +
    `${viewportBbox.top}` +
    `&WIDTH=${viewportWidth}&HEIGHT=${viewportHeight}&SRS=EPSG:3857&FORMAT=image/png&TRANSPARENT=TRUE&BGCOLOR=0xF0F0F0&EXCEPTIONS=application/vnd.ogc.se_xml&FEATURE_COUNT=99&LAYERS=${featureInfoName}&STYLES=default&QUERY_LAYERS=${featureInfoName}&INFO_FORMAT=text/html&X=${pixelX}&Y=${pixelY}
            `;

  let output = [];

  let result = "";
  let featureInfoZoom = 20;
  layer.other.keywords?.forEach((keyword) => {
    const extracted = keyword.split("carmaconf://infoBoxMapping:")[1];
    const zoom = keyword.split("carmaConf://featureInfoZoom:")[1];

    if (extracted) {
      result += extracted + "\n";
    }

    if (zoom) {
      featureInfoZoom = parseInt(zoom);
    }
  });

  if (result) {
    if (result.includes("function")) {
      result = result
        .split("\n")
        .filter((line) => line.includes("function"))
        .join("\n");
    }
    await fetch(url, { signal })
      .then((response) => response.text())
      .then((data) => {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(data, "text/xml");
        const content = xmlDoc.getElementsByTagName("gml:featureMember");

        for (let i = 0; i < content.length; i++) {
          if (content[i].outerHTML) {
            output.push(getLeafNodes(content[i]));
          }
        }
      });

    if (output) {
      const features = output
        .map((currentOutput) => {
          const feature = result.includes("function")
            ? functionToFeature(currentOutput, result)
            : objectToFeature(currentOutput, result);
          if (!feature) {
            return undefined;
          }
          return feature;
        })
        .filter((feature) => feature !== undefined);

      if (features.length === 0) {
        return undefined;
      }

      return features.map((feature) => {
        const genericLinks = feature.properties.genericLinks || [];

        return {
          properties: {
            ...feature.properties,
            genericLinks: genericLinks.concat([
              {
                url: legacyFeatureInfoUrl,
                tooltip: "Vollständige Sachdatenabfrage",
                icon: <FeatureInfoIcon />,
                target: "_legacyGetFeatureInfoHtml",
              },
            ]),
            zoom: featureInfoZoom,
          },
          geometry: {
            type: "Point",
            coordinates,
          },
          id: layer.id,
        };
      });
    }
  }
};

export const updateUrlWithCoordinates = (objectsArray, coordinates) => {
  const updatedCoords = proj4(
    proj4.defs("EPSG:4326") as unknown as string,
    proj4crs3857def,
    [coordinates[1], coordinates[0]]
  );

  const [x, y] = updatedCoords;

  const minimalBoxSize = 1;

  const newBBOX = `${x - minimalBoxSize},${y - minimalBoxSize},${
    x + minimalBoxSize
  },${y + minimalBoxSize}`;

  return objectsArray.map((obj) => {
    if (obj.tooltip === "Vollständige Sachdatenabfrage" && obj.url) {
      return {
        ...obj,
        url: obj.url.replace(/(BBOX=)[^&]+/, `$1${newBBOX}`),
      };
    }
    return obj;
  });
};
