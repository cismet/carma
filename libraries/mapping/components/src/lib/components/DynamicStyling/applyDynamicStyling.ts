import type { DynamicStylingListConfig } from "@carma/types";
import {
  captureDefaults,
  parseTarget,
  setNestedValue,
  type MetadataChanges,
} from "./dynamicStyling.helpers";

export const applyDynamicStyling = (
  libreMap: any,
  carmaLayerId: string,
  config: DynamicStylingListConfig,
  selectedOptionId: string
): MetadataChanges => {
  const stylesheet = libreMap.style?.stylesheet;
  if (!stylesheet) return {};

  const defaultOption = config.options.find((o) => o.id === config.default);
  const selectedOption = config.options.find((o) => o.id === selectedOptionId);
  if (!defaultOption || !selectedOption) return {};

  const defaults = captureDefaults(stylesheet, carmaLayerId, config);
  const updatedStylesheet = JSON.parse(JSON.stringify(stylesheet));
  const metadataChanges: MetadataChanges = {};

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
      } else {
        setNestedValue(updatedStylesheet, [category, ...rest], value);
        metadataChanges[rest.join(".")] = value;
      }
    }
  }

  libreMap.setStyle(updatedStylesheet);
  return metadataChanges;
};
