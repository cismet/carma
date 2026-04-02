import type { DynamicStylingListConfig } from "@carma/types";

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
  config: DynamicStylingListConfig
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
