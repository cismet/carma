import type {
  DynamicStylingConfig,
  DynamicStylingOptionsConfig,
} from "@carma-mapping/layers";

export const getDynamicStylingOptionsConfigs = (
  dynamicStyling: DynamicStylingConfig | DynamicStylingConfig[] | undefined
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

export const ICON_PREFIX =
  "https://geo.wuppertal.de/geoportal/geoportal_icon_legends/";

export const resolveIconSrc = (
  icon: string | undefined
): string | undefined => {
  if (!icon) return undefined;
  if (icon.startsWith("http://") || icon.startsWith("https://")) return icon;
  return `${ICON_PREFIX}${icon}.png`;
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
