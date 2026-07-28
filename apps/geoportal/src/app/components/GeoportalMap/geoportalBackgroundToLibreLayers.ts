import type { BackgroundLayer } from "@carma-mapping/layers";
import type { LibreLayer } from "@carma-mapping/core";
import { defaultLayerConf } from "@carma-appframeworks/portals";

type NamedLayerConfig = {
  type: string;
  url?: string;
  layers?: string;
  style?: string;
  version?: string;
  transparent?: boolean | string;
  maxZoom?: number;
  maxNativeZoom?: number;
};

const isTransparent = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
};

export const geoportalBackgroundToLibreLayers = (
  backgroundLayer: BackgroundLayer | null | undefined
): LibreLayer[] => {
  if (!backgroundLayer || !backgroundLayer.visible) {
    return [];
  }

  const result: LibreLayer[] = [];
  const namedLayers = (
    defaultLayerConf as { namedLayers: Record<string, NamedLayerConfig> }
  ).namedLayers;
  const layerOpacity = backgroundLayer.opacity ?? 1;

  for (const spec of backgroundLayer.layers.split("|")) {
    const [name, opacityStr] = spec.split("@");
    const cfg = namedLayers[name];
    if (!cfg) {
      console.warn(
        `[geoportalBackgroundToLibreLayers] Unknown named layer "${name}"`
      );
      continue;
    }

    const opacity =
      (opacityStr ? parseInt(opacityStr, 10) / 100 : 1) * layerOpacity;

    switch (cfg.type) {
      case "tiles": {
        if (!cfg.url) continue;
        result.push({
          type: "tiles",
          name,
          url: cfg.url,
          opacity,
          maxZoom: cfg.maxZoom ?? cfg.maxNativeZoom,
        });
        break;
      }
      case "wmts":
      case "wmts-nt": {
        if (!cfg.url || !cfg.layers) continue;
        result.push({
          type: "wmts",
          url: cfg.url,
          layers: cfg.layers,
          opacity,
          transparent: isTransparent(cfg.transparent),
        });
        break;
      }
      case "wms":
      case "wms-nt": {
        if (!cfg.url || !cfg.layers) continue;
        result.push({
          type: "wms",
          url: cfg.url,
          layers: cfg.layers,
          version: cfg.version,
          opacity,
          transparent: isTransparent(cfg.transparent),
        });
        break;
      }
      case "vector": {
        if (!cfg.style) continue;
        result.push({
          type: "vector",
          name: `bg-${name}`,
          style: cfg.style,
          opacity,
        });
        break;
      }
      default:
        console.warn(
          `[geoportalBackgroundToLibreLayers] Unsupported layer type "${cfg.type}" for "${name}"`
        );
    }
  }

  return result;
};
