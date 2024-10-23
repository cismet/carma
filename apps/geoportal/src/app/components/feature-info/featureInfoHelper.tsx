import { LayerProps } from "@carma-mapping/layers";
import FeatureInfoIcon from "./FeatureInfoIcon";
import { proj4crs25832def } from "react-cismap/constants/gis";
import proj4 from "proj4";

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
  let codeFunction = eval("(" + code + ")");
  const tmpInfo = codeFunction(output);

  const properties = {
    ...tmpInfo,
    wmsProps: output,
  };

  return { properties };
};

export const createUrl = (baseUrl, pos, minimalBoxSize, layerName) => {
  const url =
    baseUrl +
    `?SERVICE=WMS&request=GetFeatureInfo&format=image%2Fpng&transparent=true&version=1.1.1&tiled=true&width=10&height=10&srs=EPSG%3A25832&` +
    `bbox=` +
    `${pos[0] - minimalBoxSize},` +
    `${pos[1] - minimalBoxSize},` +
    `${pos[0] + minimalBoxSize},` +
    `${pos[1] + minimalBoxSize}&` +
    `x=5&y=5&` +
    `layers=${layerName}&` +
    `feature_count=100&QUERY_LAYERS=${layerName}&`;

  return url;
};

export const getFeatureForLayer = async (layer, pos, coordinates) => {
  const props = layer.props as LayerProps;
  const minimalBoxSize = 1;
  const url = createUrl(
    props.url.includes("https")
      ? props.url
      : props.url.replace("http", "https"),
    pos,
    minimalBoxSize,
    props.name,
  );

  const imgUrl =
    props.url +
    `&VERSION=1.1.1&REQUEST=GetFeatureInfo&BBOX=` +
    `${pos[0] - minimalBoxSize},` +
    `${pos[1] - minimalBoxSize},` +
    `${pos[0] + minimalBoxSize},` +
    `${pos[1] + minimalBoxSize}` +
    `&WIDTH=10&HEIGHT=10&SRS=EPSG:25832&FORMAT=image/png&TRANSPARENT=TRUE&BGCOLOR=0xF0F0F0&EXCEPTIONS=application/vnd.ogc.se_xml&FEATURE_COUNT=99&LAYERS=${props.name}&STYLES=default&QUERY_LAYERS=${props.name}&INFO_FORMAT=text/html&X=5&Y=5
            `;

  let output = "";

  let result = "";
  let featureInfoZoom = 20;
  layer.other.keywords.forEach((keyword) => {
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
    await fetch(url)
      .then((response) => response.text())
      .then((data) => {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(data, "text/xml");
        const content = xmlDoc.getElementsByTagName("gml:featureMember")[0];

        output = content?.outerHTML ? getLeafNodes(content) : "";
      });

    if (output) {
      const feature = result.includes("function")
        ? functionToFeature(output, result)
        : objectToFeature(output, result);
      const genericLinks = feature.properties.genericLinks || [];

      return {
        properties: {
          ...feature.properties,
          genericLinks: genericLinks.concat([
            {
              url: imgUrl,
              tooltip: "Alte Sachdatenabfrage",
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
    }
  }
};

export const updateUrlWithCoordinates = (objectsArray, coordinates) => {
  const updatedCoords = proj4(
    proj4.defs("EPSG:4326") as unknown as string,
    proj4crs25832def,
    [coordinates[1], coordinates[0]],
  );

  const [x, y] = updatedCoords;

  const minimalBoxSize = 1;

  const newBBOX = `${x - minimalBoxSize},${y - minimalBoxSize},${
    x + minimalBoxSize
  },${y + minimalBoxSize}`;

  return objectsArray.map((obj) => {
    if (obj.tooltip === "Alte Sachdatenabfrage" && obj.url) {
      return {
        ...obj,
        url: obj.url.replace(/(BBOX=)[^&]+/, `$1${newBBOX}`),
      };
    }
    return obj;
  });
};
