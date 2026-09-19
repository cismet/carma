import type { BackgroundLayer } from "@carma-mapping/layers";
import type { LibreLayer } from "@carma-mapping/core";
import { defaultLayerConf } from "@carma-appframeworks/portals";
import { prepareTerrainDrapeStyle } from "@carma-mapping/engines/maplibre";

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
  /** Every visible layer is a standalone tileset: no basemap at all. */
  standaloneMeshOnly?: boolean;
};

// Shaded terrain and the shadow simulation drape whatever background is
// active; they never substitute a basemap of their own. Swapping in the
// vector relief style cost a full style reload, 567 layers against 6 and the
// first ground tile only after about five seconds, and it took the chosen
// Karte or Luftbild away from the user. A vector background is adjusted in
// place for the drape instead, see prepareTerrainDrapeStyle, and a raster one
// is draped as authored. Place names baked into raster ground pixels remain
// on the surface until the billboard label pass exists.

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
  if (options.standaloneMeshOnly) return [];

  const result: LibreLayer[] = [];
  const namedLayers = {
    ...(defaultLayerConf as { namedLayers: Record<string, NamedLayerConfig> })
      .namedLayers,
    ...extraNamedLayers,
  };
  const layerOpacity = backgroundLayer.opacity ?? 1;
  // All named layers of a background spec belong to the single background
  // button, so they share one id and their loading states aggregate.
  const carmaLayerId = backgroundLayer.id;

  const layerSpecs = backgroundLayer.layers.split("|");

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
          ...(options.shadowTerrainActive
            ? {
                userStyleTransform: prepareTerrainDrapeStyle,
                userStyleTransformKey: "terrain-albedo-v1",
              }
            : {}),
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
