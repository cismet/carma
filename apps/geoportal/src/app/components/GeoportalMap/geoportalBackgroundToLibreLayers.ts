import type { BackgroundLayer } from "@carma-mapping/layers";
import type { LibreLayer } from "@carma-mapping/core";
import { defaultLayerConf } from "@carma-appframeworks/portals";
import { prepareTerrainDrapeStyle } from "@carma-mapping/engines/maplibre";

import { cacheableWms } from "../../helper/cacheable-wms";
import { MapStyleKeys } from "../../constants/MapStyleKeys";

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
  shadowTerrainActive?: boolean;
  /** Whether MapStyle3d is mounted on the current route, including overrides. */
  mapStyle3dActive?: boolean;
  /** A textured basis supplies aerial pixels; use the vector source only for its labels. */
  meshBaseActive?: boolean;
  /** Every visible layer is a standalone tileset: no basemap at all. */
  standaloneMeshOnly?: boolean;
  /**
   * Replace the authored raster bases with the vector base map, on the user's
   * explicit request from the shadow settings while MapStyle3d is active.
   * Only applies to Karte; Luftbild keeps the selected orthophoto.
   */
  vectorBaseOverride?: boolean;
};

const VECTOR_BASE_OVERRIDE_LAYERS = "basemap_relief@100";

// Shaded terrain and the shadow simulation drape whatever background is
// active; they never substitute a basemap of their own unless asked to. Swapping in the
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

  // The category switch wins over the remembered vector-map preference:
  // Luftbild supplies orthophoto pixels unless a textured mesh owns those pixels.
  const vectorBaseOverride =
    options.mapStyle3dActive === true &&
    options.vectorBaseOverride === true &&
    (backgroundLayer.id !== MapStyleKeys.AERIAL ||
      options.meshBaseActive === true);
  const layerSpecs = vectorBaseOverride
    ? VECTOR_BASE_OVERRIDE_LAYERS.split("|")
    : backgroundLayer.layers.split("|");

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
          ...cacheableWms({
            url: cfg.url,
            layers: cfg.layers,
            transparent: isTransparent(cfg.transparent),
          }),
          carmaLayerId,
          opacity,
          ...(cfg.type === "wmts-nt" ? { nonTiled: true } : {}),
        });
        break;
      }
      case "wms":
      case "wms-nt": {
        if (!cfg.url || !cfg.layers) continue;
        result.push({
          type: "wms",
          ...cacheableWms({
            url: cfg.url,
            layers: cfg.layers,
            transparent: isTransparent(cfg.transparent),
          }),
          carmaLayerId,
          version: cfg.version,
          opacity,
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
          ...(options.shadowTerrainActive || vectorBaseOverride
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
