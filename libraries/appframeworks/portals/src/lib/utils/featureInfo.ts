import type { FeatureInfo, FeatureInfoProperties } from "@carma/types";
import { sandboxedEvalExternal } from "../components/SandboxedEvalProvider";

/**
 * @deprecated Use `objectToInfo` instead.
 */
export const objectToFeature = async (jsonOutput: any, code: string) => {
  if (!jsonOutput) {
    return {
      properties: {
        title: "Keine Informationen gefunden",
      },
    } as FeatureInfo;
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

  const baseInfo = (await sandboxedEvalExternal(
    functionString,
    jsonOutput
  )) as FeatureInfoProperties;

  const properties = {
    ...baseInfo,
    wmsProps: jsonOutput,
  };

  return { properties };
};

export const objectToInfo = async (jsonOutput: any, code: string) => {
  if (!jsonOutput) {
    return undefined;
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

  const baseInfo = (await sandboxedEvalExternal(
    functionString,
    jsonOutput
  )) as FeatureInfoProperties;
  return baseInfo;
};

/**
 * @deprecated Use `functionToInfo` instead.
 */

export const functionToFeature = async (output: any, code: string) => {
  try {
    // await new Promise((resolve) => setTimeout(resolve, 2000));
    const baseInfo = (await sandboxedEvalExternal(
      "(" + code + ")",
      output
    )) as FeatureInfoProperties;

    if (baseInfo == null) {
      return undefined;
    }

    const properties = {
      ...baseInfo,
      wmsProps: output,
    };

    return { properties };
  } catch (error) {
    console.log(error);
    return undefined;
  }
};

export const functionToInfo = async (output: any, code: string) => {
  try {
    // await new Promise((resolve) => setTimeout(resolve, 2000));
    const baseInfo = (await sandboxedEvalExternal(
      "(" + code + ")",
      output
    )) as FeatureInfoProperties;

    if (baseInfo == null) {
      return undefined;
    }
    return baseInfo;
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

export const createVectorFeature = async (mapping, selectedVectorFeature) => {
  let feature: any = undefined;

  let properties = selectedVectorFeature.properties;
  properties = {
    ...properties,
    vectorId: selectedVectorFeature.id,
  };
  let result = "";
  let featureInfoZoom = 20;
  mapping.forEach((keyword) => {
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
      ? await functionToFeature(properties, result)
      : await objectToFeature(properties, result);
    if (!featureProperties) {
      return undefined;
    }
    const genericLinks = featureProperties.properties.genericLinks || [];

    feature = {
      sourceFeature: selectedVectorFeature,
      properties: {
        ...featureProperties.properties,
        genericLinks: genericLinks,
        zoom: featureInfoZoom,
      },
      geometry: selectedVectorFeature.geometry,
    };
  }

  return feature;
};

export const getInfoBoxControlObjectFromMappingAndVectorFeature = async ({
  mapping = [],
  selectedVectorFeature,
}) => {
  const properties = {
    ...selectedVectorFeature.properties,
    vectorId: selectedVectorFeature.id,
  };
  let result = "";
  mapping.forEach((keyword) => {
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
    const info = result.includes("function")
      ? await functionToInfo(properties, result)
      : await objectToInfo(properties, result);

    return info;
  }
};
