import type { StyleSpecification } from "maplibre-gl";

import type { DynamicStylingOptionsConfig, Layer } from "@carma-mapping/layers";
import type { LibreLayer } from "@carma-mapping/core";
import {
  THREE_TILES_LAYER_TYPE,
  THREE_TILES_SHADER_KIND,
} from "@carma-mapping/engines/maplibre";
import {
  applyDynamicStylingToStylesheet,
  buildFilterExpression,
} from "@carma-mapping/components";

type ThreeTilesLibreLayer = Extract<LibreLayer, { type: "three-tiles" }>;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const parseThreeTilesLayer = (
  layer: Layer
): ThreeTilesLibreLayer | null => {
  const candidate = (layer.conf as Record<string, unknown> | undefined)
    ?.threeTiles;
  if (!candidate || typeof candidate !== "object") return null;

  const config = candidate as Record<string, unknown>;
  const shader = config.shader;
  if (typeof config.url !== "string" || !shader || typeof shader !== "object") {
    return null;
  }

  const shaderConfig = shader as Record<string, unknown>;
  if (
    shaderConfig.kind !== THREE_TILES_SHADER_KIND.CLAY ||
    typeof shaderConfig.color !== "string"
  ) {
    return null;
  }

  const origin = config.origin;
  const validOrigin =
    Array.isArray(origin) && origin.length === 2 && origin.every(isFiniteNumber)
      ? ([origin[0], origin[1]] as [number, number])
      : undefined;

  return {
    type: THREE_TILES_LAYER_TYPE,
    name: layer.title || layer.id,
    carmaLayerId: layer.id,
    url: config.url,
    shader: {
      kind: THREE_TILES_SHADER_KIND.CLAY,
      color: shaderConfig.color,
      ...(isFiniteNumber(shaderConfig.roughness)
        ? { roughness: shaderConfig.roughness }
        : {}),
      ...(isFiniteNumber(shaderConfig.metalness)
        ? { metalness: shaderConfig.metalness }
        : {}),
    },
    ...(validOrigin ? { origin: validOrigin } : {}),
    ...(isFiniteNumber(config.errorTarget)
      ? { errorTarget: config.errorTarget }
      : {}),
    ...(isFiniteNumber(config.requestConcurrency)
      ? { requestConcurrency: config.requestConcurrency }
      : {}),
    opacity: layer.opacity ?? 1,
  };
};

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
    const threeTilesLayer = parseThreeTilesLayer(layer);
    if (threeTilesLayer) {
      result.push(threeTilesLayer);
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
        ...(layer.opacityTransition !== undefined
          ? { opacityTransition: layer.opacityTransition }
          : {}),
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
        ...(layer.opacityTransition !== undefined
          ? { opacityTransition: layer.opacityTransition }
          : {}),
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
