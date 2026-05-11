import type { StyleSpecification } from "maplibre-gl";

import { CARMA_MAPLIBRE_SOURCE_DEFAULTS } from "./carma-maplibre-source-defaults";
import { slugifyUrl } from "../utils/styleComposer";

export interface MaplibreStyleConfig {
  terrain?: {
    url: string;
    tileSize?: number;
    maxzoom?: number;
  };
  baseMap?: {
    url: string;
    tileSize?: number;
    opacity?: number;
  };
}

export const EMPTY_MAPLIBRE_STYLE = {
  version: 8,
  sources: {},
  layers: [],
} as const satisfies StyleSpecification;

export function createDefaultStyle(
  config: MaplibreStyleConfig
): StyleSpecification {
  const sources: StyleSpecification["sources"] = {};
  const layers: StyleSpecification["layers"] = [];

  if (config.terrain) {
    sources[slugifyUrl(config.terrain.url)] = {
      type: "raster-dem",
      tiles: [config.terrain.url],
      tileSize:
        config.terrain.tileSize ??
        CARMA_MAPLIBRE_SOURCE_DEFAULTS.terrainTileSize,
      maxzoom:
        config.terrain.maxzoom ?? CARMA_MAPLIBRE_SOURCE_DEFAULTS.terrainMaxZoom,
    };
  }

  if (config.baseMap) {
    sources["source-basemap"] = {
      type: "raster",
      tiles: [config.baseMap.url],
      tileSize:
        config.baseMap.tileSize ??
        CARMA_MAPLIBRE_SOURCE_DEFAULTS.rasterTileSize,
    };

    layers.push({
      id: "layer-basemap",
      type: "raster",
      source: "source-basemap",
      paint: {
        "raster-opacity": config.baseMap.opacity ?? 0.9,
      },
    });
  }

  return {
    version: 8,
    sources,
    layers,
  };
}

export function createPreviewStyle(
  config: MaplibreStyleConfig
): StyleSpecification {
  if (!config.baseMap) return EMPTY_MAPLIBRE_STYLE;

  return {
    version: 8,
    sources: {
      "source-basemap": {
        type: "raster",
        tiles: [config.baseMap.url],
        tileSize:
          config.baseMap.tileSize ??
          CARMA_MAPLIBRE_SOURCE_DEFAULTS.rasterTileSize,
      },
    },
    layers: [
      {
        id: "layer-basemap",
        type: "raster",
        source: "source-basemap",
        paint: {
          "raster-opacity": config.baseMap.opacity ?? 0.9,
        },
      },
    ],
  };
}

export const CARMA_DEFAULT_STYLE = EMPTY_MAPLIBRE_STYLE;
export const CARMA_PREVIEW_STYLE = EMPTY_MAPLIBRE_STYLE;
