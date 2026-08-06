import type { StyleSpecification } from "maplibre-gl";

import type { DynamicStylingOptionsConfig, Layer } from "@carma-mapping/layers";
import type { LibreLayer } from "@carma-mapping/core";
import {
  applyDynamicStylingToStylesheet,
  buildFilterExpression,
} from "@carma-mapping/components";

const collectDynamicStylingConfigs = (
  layer: Layer
): DynamicStylingOptionsConfig[] => {
  if (Array.isArray(layer.dynamicStyling)) {
    return layer.dynamicStyling;
  }
  return layer.dynamicStyling ? [layer.dynamicStyling] : [];
};

const buildDynamicStylingTransform = (
  layer: Layer
): { transform: (style: any) => any; key: string } | null => {
  const configs = collectDynamicStylingConfigs(layer);
  if (!configs.length) {
    return null;
  }
  const selections =
    typeof layer.dynamicStylingSelection === "object" &&
    layer.dynamicStylingSelection !== null
      ? (layer.dynamicStylingSelection as Record<number, string>)
      : {};
  const effective = configs.map((config, idx) => ({
    config,
    selection: selections[idx] ?? config.default,
  }));
  if (
    effective.every(({ config, selection }) => selection === config.default)
  ) {
    return null;
  }
  const transform = (style: any) => {
    let current = style;
    for (const { config, selection } of effective) {
      if (selection === config.default) {
        continue;
      }
      const next = applyDynamicStylingToStylesheet(
        current,
        layer.id,
        config,
        selection
      );
      if (next) {
        current = next;
      }
    }
    return current;
  };
  const key = effective.map(({ selection }) => selection).join("|");
  return { transform, key };
};

export const geoportalLayersToLibreLayers = (layers: Layer[]): LibreLayer[] => {
  const result: LibreLayer[] = [];

  for (const layer of layers) {
    if (!layer.visible) {
      continue;
    }
    if (!layer.props) {
      continue;
    }

    if (layer.layerType === "wmts" || layer.layerType === "wmts-nt") {
      const { url, name } = layer.props as { url?: string; name?: string };
      if (!url || !name) {
        continue;
      }
      result.push({
        type: "wmts",
        url,
        layers: name,
        carmaLayerId: layer.id,
        transparent: true,
        opacity: layer.opacity ?? 1,
        ...(layer.layerType === "wmts-nt" ? { nonTiled: true } : {}),
      });
    } else if (layer.layerType === "vector") {
      const { style } = layer.props as {
        style?: string | StyleSpecification;
      };
      if (!style) {
        continue;
      }
      const userFilter =
        layer.filterConfig && layer.filterState
          ? buildFilterExpression(layer.filterConfig, layer.filterState)
          : null;
      const dynamicTransform = buildDynamicStylingTransform(layer);
      result.push({
        type: "vector",
        name: layer.id,
        carmaLayerId: layer.id,
        style,
        opacity: layer.opacity ?? 1,
        ...(userFilter ? { userFilter } : {}),
        ...(dynamicTransform
          ? {
              userStyleTransform: dynamicTransform.transform,
              userStyleTransformKey: dynamicTransform.key,
            }
          : {}),
      });
    }
  }

  return result;
};
