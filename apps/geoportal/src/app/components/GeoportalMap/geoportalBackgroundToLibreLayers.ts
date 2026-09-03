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

type GeoportalBackgroundLibreOptions = {
  terrainMeshActive?: boolean;
  shadowTerrainActive?: boolean;
};

// Raster bases bake place names into their ground pixels. Shaded terrain uses
// the existing vector basemap instead so its ground can be projected while
// point-based place names remain a separate symbol pass above Three.
const TERRAIN_MESH_OVERLAY_LAYERS = "basemap_relief@100";
const TERRAIN_MESH_REPLACED_LAYER_NAMES = new Set([
  "amtlich",
  "amtlichBasiskarte",
  "rvrGrundriss",
  "rvrSchriftNT",
  "basemap_relief",
]);

const isTransparent = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
};

export const geoportalBackgroundToLibreLayers = (
  backgroundLayer: BackgroundLayer | null | undefined,
  extraNamedLayers?: Record<string, NamedLayerConfig>,
  options: GeoportalBackgroundLibreOptions = {}
): LibreLayer[] => {
  if (!backgroundLayer || !backgroundLayer.visible) {
    return [];
  }

  const result: LibreLayer[] = [];
  const namedLayers = {
    ...(defaultLayerConf as { namedLayers: Record<string, NamedLayerConfig> })
      .namedLayers,
    ...extraNamedLayers,
  };
  const layerOpacity = backgroundLayer.opacity ?? 1;
  const separateLocationLabels =
    options.terrainMeshActive === true || options.shadowTerrainActive === true;
  // All named layers of a background spec belong to the single background
  // button, so they share one id and their loading states aggregate.
  const carmaLayerId = backgroundLayer.id;

  const originalLayerSpecs = backgroundLayer.layers
    .split("|")
    .filter(
      (spec) =>
        !separateLocationLabels ||
        !TERRAIN_MESH_REPLACED_LAYER_NAMES.has(spec.split("@")[0])
    );
  const layerSpecs = separateLocationLabels
    ? [...originalLayerSpecs, ...TERRAIN_MESH_OVERLAY_LAYERS.split("|")]
    : originalLayerSpecs;

  for (const spec of layerSpecs) {
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
          carmaLayerId,
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
          carmaLayerId,
          opacity,
          transparent: isTransparent(cfg.transparent),
          ...(cfg.type === "wmts-nt" ? { nonTiled: true } : {}),
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
          carmaLayerId,
          version: cfg.version,
          opacity,
          transparent: isTransparent(cfg.transparent),
          ...(cfg.type === "wms-nt" ? { nonTiled: true } : {}),
        });
        break;
      }
      case "vector": {
        if (!cfg.style) continue;
        result.push({
          type: "vector",
          name: `bg-${name}`,
          carmaLayerId,
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
