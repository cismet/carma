import type { DynamicStylingOptionsConfig } from "@carma-mapping/layers";

export const getDynamicStylingOptionsConfigs = (
  dynamicStyling:
    | DynamicStylingOptionsConfig
    | DynamicStylingOptionsConfig[]
    | undefined
): DynamicStylingOptionsConfig[] => {
  const configs = Array.isArray(dynamicStyling)
    ? dynamicStyling
    : dynamicStyling
    ? [dynamicStyling]
    : [];
  return configs.filter(
    (c): c is DynamicStylingOptionsConfig =>
      c.type === "list" || c.type === "toggle"
  );
};

export const getDynamicStylingSelections = (
  selection: unknown
): Record<number, string> => {
  return typeof selection === "object" && selection !== null
    ? (selection as Record<number, string>)
    : {};
};

export const parseTarget = (target: string) => {
  const parts = target.split(".");
  return {
    category: parts[0],
    rest: parts.slice(1),
  };
};

export const setNestedValue = (obj: any, path: string[], value: unknown) => {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    if (current[path[i]] == null || typeof current[path[i]] !== "object") {
      current[path[i]] = {};
    }
    current = current[path[i]];
  }
  current[path[path.length - 1]] = value;
};

const defaultLayerValues: Record<string, Record<string, unknown>> = {};

export const captureDefaults = (
  stylesheet: any,
  carmaLayerId: string,
  config: DynamicStylingOptionsConfig
) => {
  if (defaultLayerValues[carmaLayerId]) return defaultLayerValues[carmaLayerId];

  const defaults: Record<string, unknown> = {};
  for (const [, targets] of Object.entries(config.targets)) {
    for (const target of targets) {
      const { category, rest } = parseTarget(target);
      if (category !== "layers") continue;
      const [layerId, type, ...propertyParts] = rest;
      const layer = stylesheet.layers?.find((l: any) => l.id === layerId);
      if (!layer) continue;
      const property = propertyParts.join(".");
      const val = layer[type]?.[property];
      if (val !== undefined && val !== null) {
        defaults[target] = JSON.parse(JSON.stringify(val));
      }
    }
  }
  defaultLayerValues[carmaLayerId] = defaults;
  return defaults;
};

export type MetadataChanges = Record<string, unknown>;

export type LayerInfo = Record<string, unknown> & {
  keywords?: string[];
  title?: string;
  icon?: string;
  vectorLegend?: string;
};

const KEYWORD_SEGMENT = "keywords";

export const isKeywordTarget = (pathSegments: string[]): boolean => {
  const kwIdx = pathSegments.indexOf(KEYWORD_SEGMENT);
  return kwIdx >= 0 && kwIdx < pathSegments.length - 1;
};

export const setKeywordValue = (
  obj: any,
  pathToKeywords: string[],
  keywordPrefix: string,
  value: unknown
) => {
  let current = obj;
  for (const segment of pathToKeywords) {
    if (current[segment] == null || typeof current[segment] !== "object") {
      current[segment] = {};
    }
    current = current[segment];
  }

  const fullPrefix = keywordPrefix + ":";
  if (!Array.isArray(current)) return;

  const idx = current.findIndex(
    (kw: string) =>
      typeof kw === "string" &&
      kw.toLowerCase().startsWith(fullPrefix.toLowerCase())
  );

  const newEntry = `${fullPrefix}${value}`;
  if (idx >= 0) {
    current[idx] = newEntry;
  } else {
    current.push(newEntry);
  }
};

export const extractLayerInfo = (stylesheet: any): LayerInfo | null => {
  return stylesheet?.metadata?.carmaConf?.layerInfo ?? null;
};

export const extractCarmaConf = (
  stylesheet: any
): Record<string, unknown> | null => {
  const carmaConf = stylesheet?.metadata?.carmaConf;
  if (!carmaConf || typeof carmaConf !== "object") {
    return null;
  }
  const { layerInfo, ...rest } = carmaConf;
  return rest;
};

/**
 * Pure transformation: given an unmodified per-layer stylesheet, a dynamic
 * styling config, and a selected option id, return a deep-cloned stylesheet
 * with the option's `targets` applied (paint/layout properties replaced,
 * keywords swapped, layerInfo metadata updated). The original stylesheet is
 * left untouched.
 *
 * Returns null when the option ids are unknown. Used both by the live-map
 * `applyDynamicStyling` (leaflet path) and by the libreMap style builder so
 * that the merged map style already reflects the selected option.
 */
export const applyDynamicStylingToStylesheet = (
  stylesheet: any,
  carmaLayerId: string,
  config: DynamicStylingOptionsConfig,
  selectedOptionId: string
): any | null => {
  const defaultOption = config.options.find((o) => o.id === config.default);
  const selectedOption = config.options.find((o) => o.id === selectedOptionId);
  if (!defaultOption || !selectedOption) {
    return null;
  }

  const defaults = captureDefaults(stylesheet, carmaLayerId, config);
  const updatedStylesheet = JSON.parse(JSON.stringify(stylesheet));

  for (const [key, targets] of Object.entries(config.targets)) {
    const value = selectedOption[key];
    if (value === undefined) continue;

    for (const target of targets) {
      const { category, rest } = parseTarget(target);

      if (category === "layers") {
        const [layerId, type, ...propertyParts] = rest;
        const layer = updatedStylesheet.layers?.find(
          (l: any) => l.id === layerId
        );
        if (!layer) continue;
        const property = propertyParts.join(".");
        if (!layer[type]) layer[type] = {};

        const originalVal = defaults[target];
        if (originalVal === undefined) {
          layer[type][property] = value;
          continue;
        }

        const fromVal = defaultOption[key];
        const replacements: [string, string][] = [
          [String(fromVal), String(value)],
        ];
        if (selectedOption.replacements?.[key]) {
          replacements.push(
            ...(selectedOption.replacements[key] as [string, string][])
          );
        }

        let serialized = JSON.stringify(originalVal);
        for (const [from, to] of replacements) {
          serialized = serialized.replaceAll(from, to);
        }
        layer[type][property] = JSON.parse(serialized);
      } else if (isKeywordTarget(rest)) {
        const kwIdx = rest.indexOf("keywords");
        const pathToKeywords = [category, ...rest.slice(0, kwIdx + 1)];
        const keywordPrefix = rest.slice(kwIdx + 1).join(".");
        setKeywordValue(
          updatedStylesheet,
          pathToKeywords,
          keywordPrefix,
          value
        );
      } else {
        setNestedValue(updatedStylesheet, [category, ...rest], value);
      }
    }
  }

  return updatedStylesheet;
};

const lastAppliedDynamicStyling: Map<string, Record<number, string>> = new Map();

export const getLastAppliedSelection = (
  layerId: string,
  configIdx: number
): string | undefined => {
  return lastAppliedDynamicStyling.get(layerId)?.[configIdx];
};

export const setLastAppliedSelection = (
  layerId: string,
  configIdx: number,
  selection: string
): void => {
  const existing = lastAppliedDynamicStyling.get(layerId) ?? {};
  existing[configIdx] = selection;
  lastAppliedDynamicStyling.set(layerId, existing);
};
