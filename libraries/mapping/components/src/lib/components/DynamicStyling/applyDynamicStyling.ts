import type { DynamicStylingOptionsConfig } from "@carma-mapping/layers";
import {
  applyDynamicStylingToStylesheet,
  extractLayerInfo,
  extractCarmaConf,
  type LayerInfo,
} from "./dynamicStyling.helpers";

export type DynamicStylingResult = {
  layerInfo: LayerInfo | null;
  carmaConf: Record<string, unknown> | null;
};

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
): DynamicStylingResult | null => {
  const stylesheet = libreMap.style?.stylesheet;
  if (!stylesheet) {
    return null;
  }

  const updatedStylesheet = applyDynamicStylingToStylesheet(
    stylesheet,
    carmaLayerId,
    config,
    selectedOptionId
  );
  if (!updatedStylesheet) {
    return null;
  }

  // Stop flickering after style changes with multiple fill-patterns. Just and temporary fix. Should not be used when switching to native maplibre map
  libreMap.setStyle(intermediateEmptyStyle(libreMap.getStyle()));
  libreMap.setStyle(updatedStylesheet);
  return {
    layerInfo: extractLayerInfo(updatedStylesheet),
    carmaConf: extractCarmaConf(updatedStylesheet),
  };
};
