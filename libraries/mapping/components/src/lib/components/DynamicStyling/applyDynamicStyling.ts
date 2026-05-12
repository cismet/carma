import type { DynamicStylingOptionsConfig } from "@carma-mapping/layers";
import {
  captureDefaults,
  parseTarget,
  setNestedValue,
  isKeywordTarget,
  setKeywordValue,
  extractLayerInfo,
  type LayerInfo,
} from "./dynamicStyling.helpers";

function intermediateEmptyStyle(style: any) {
  return {
    ...style,
    layers: [],
  };
}

export const applyDynamicStyling = (
  libreMap: maplibregl.Map,
  carmaLayerId: string,
  config: DynamicStylingOptionsConfig,
  selectedOptionId: string
): LayerInfo | null => {
  const stylesheet = libreMap.style?.stylesheet;
  if (!stylesheet) {
    return null;
  }

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

  // Stop flickering after style changes with multiple fill-patterns. Just and temporary fix. Should not be used when switching to native maplibre map
  libreMap.setStyle(intermediateEmptyStyle(libreMap.getStyle()));
  libreMap.setStyle(updatedStylesheet);
  return extractLayerInfo(updatedStylesheet);
};
