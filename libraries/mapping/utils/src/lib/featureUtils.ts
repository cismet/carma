/**
 * Feature utilities for transforming map feature properties into infobox content.
 * Uses sandboxed eval for safe code execution.
 */

import type { FeatureInfoProperties } from "@carma/types";
import { sandboxedEvalExternal } from "@carma-commons/sandbox-eval";

/**
 * Transform feature properties using a function string.
 * Returns a feature object with properties wrapped.
 * @deprecated Use `functionToInfo` instead for cleaner API.
 */
export const functionToFeature = async (
  output: Record<string, unknown>,
  code: string
): Promise<{ properties: Record<string, unknown> } | undefined> => {
  try {
    const baseInfo = (await sandboxedEvalExternal(
      "(" + code + ")",
      output
    )) as Record<string, unknown>;

    if (baseInfo == null) {
      return undefined;
    }

    const properties = {
      ...baseInfo,
      sourceProps: output,
    };

    return { properties };
  } catch (error) {
    console.error("Error in functionToFeature:", error);
    return undefined;
  }
};

/**
 * Transform feature properties using a function string.
 * Returns just the info object (without wrapper).
 */
export const functionToInfo = async (
  output: Record<string, unknown>,
  code: string
): Promise<FeatureInfoProperties | undefined> => {
  try {
    const baseInfo = (await sandboxedEvalExternal(
      "(" + code + ")",
      output
    )) as FeatureInfoProperties;

    if (baseInfo == null) {
      return undefined;
    }
    return baseInfo;
  } catch (error) {
    console.error("Error in functionToInfo:", error);
    return undefined;
  }
};

/**
 * Transform feature properties using configuration lines (object mapping).
 * Returns a feature object with properties wrapped.
 * @deprecated Use `objectToInfo` instead for cleaner API.
 */
export const objectToFeature = async (
  jsonOutput: Record<string, unknown> | null,
  code: string
): Promise<{ properties: Record<string, unknown> }> => {
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

  const baseInfo = (await sandboxedEvalExternal(
    functionString,
    jsonOutput
  )) as Record<string, unknown>;

  const properties = {
    ...baseInfo,
    sourceProps: jsonOutput,
  };

  return { properties };
};

/**
 * Transform feature properties using configuration lines (object mapping).
 * Returns just the info object (without wrapper).
 */
export const objectToInfo = async (
  jsonOutput: Record<string, unknown> | null,
  code: string
): Promise<FeatureInfoProperties | undefined> => {
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
 * Create a WMS GetFeatureInfo URL
 */
export const createFeatureInfoUrl = ({
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
}): string => {
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

/**
 * @deprecated Use `createFeatureInfoUrl` instead.
 */
export const createUrl = createFeatureInfoUrl;

export interface VectorFeatureInput {
  id?: string | number;
  properties: Record<string, unknown>;
  geometry?: GeoJSON.Geometry;
}

export interface VectorFeatureResult {
  sourceFeature: VectorFeatureInput;
  properties: Record<string, unknown>;
  geometry?: GeoJSON.Geometry;
}

/**
 * Create a feature object from a vector feature and its mapping configuration.
 */
export const createVectorFeature = async (
  mapping: string[],
  selectedVectorFeature: VectorFeatureInput
): Promise<VectorFeatureResult | undefined> => {
  let feature: VectorFeatureResult | undefined = undefined;

  let properties: Record<string, unknown> = selectedVectorFeature.properties;
  properties = {
    ...properties,
    vectorId: selectedVectorFeature.id,
  };
  let result = "";
  const featureInfoZoom = 20;

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

    const genericLinks =
      (featureProperties.properties.genericLinks as unknown[]) || [];

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

/**
 * Get infobox control object from mapping and vector feature.
 * Returns just the info properties without the feature wrapper.
 */
export const getInfoBoxControlObjectFromMappingAndVectorFeature = async ({
  mapping = [],
  selectedVectorFeature,
}: {
  mapping?: string[];
  selectedVectorFeature: VectorFeatureInput;
}): Promise<FeatureInfoProperties | undefined> => {
  const properties: Record<string, unknown> = {
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

  return undefined;
};
