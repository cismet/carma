import type { StyleSpecification } from "maplibre-gl";
import { slugifyUrl } from "../utils/styleComposer";

/**
 * Configuration for creating a city-specific MapLibre default style.
 * Other cities can define their own config and use createDefaultStyle().
 */
export interface CityMapConfig {
  /** Terrain DEM source configuration (optional - not all cities have terrain data) */
  terrain?: {
    url: string;
    tileSize?: number;
    maxzoom?: number;
  };
  /** Base map raster tile source */
  baseMap: {
    url: string;
    tileSize?: number;
    opacity?: number;
  };
}

/**
 * Factory function to create a default MapLibre style for any city.
 *
 * @example
 * // For a new city:
 * const COLOGNE_CONFIG: CityMapConfig = {
 *   baseMap: {
 *     url: "https://example.com/cologne-tiles/{z}/{x}/{y}.png",
 *     tileSize: 256,
 *   },
 * };
 * const COLOGNE_DEFAULT_STYLE = createDefaultStyle(COLOGNE_CONFIG);
 */
export function createDefaultStyle(config: CityMapConfig): StyleSpecification {
  const sources: StyleSpecification["sources"] = {};
  const layers: StyleSpecification["layers"] = [];

  // Add terrain source if configured (slugified URL as ID)
  if (config.terrain) {
    sources[slugifyUrl(config.terrain.url)] = {
      type: "raster-dem",
      tiles: [config.terrain.url],
      tileSize: config.terrain.tileSize ?? 512,
      maxzoom: config.terrain.maxzoom ?? 15,
    };
  }

  // Add base map source
  sources["source-basemap"] = {
    type: "raster",
    tiles: [config.baseMap.url],
    tileSize: config.baseMap.tileSize ?? 256,
  };

  // Add base map layer
  layers.push({
    id: "layer-basemap",
    type: "raster",
    source: "source-basemap",
    paint: {
      "raster-opacity": config.baseMap.opacity ?? 0.9,
    },
  });

  return {
    version: 8,
    sources,
    layers,
  };
}

/**
 * Factory function to create a preview style (without terrain) for any city.
 */
export function createPreviewStyle(config: CityMapConfig): StyleSpecification {
  return {
    version: 8,
    sources: {
      "source-basemap": {
        type: "raster",
        tiles: [config.baseMap.url],
        tileSize: config.baseMap.tileSize ?? 256,
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

// =============================================================================
// Wuppertal-specific configuration
// =============================================================================

export const WUPPERTAL_CONFIG: CityMapConfig = {
  terrain: {
    url: "https://wuppertal-terrain.cismet.de/services/wupp_dgm_01/tiles/{z}/{x}/{y}.png",
    tileSize: 512,
    maxzoom: 15,
  },
  baseMap: {
    url: "https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
    tileSize: 256,
    opacity: 0.9,
  },
};

/** Default MapLibre style for Wuppertal (includes terrain source) */
export const WUPPERTAL_DEFAULT_STYLE = createDefaultStyle(WUPPERTAL_CONFIG);

/** Preview style for Wuppertal (no terrain, full opacity) */
export const WUPPERTAL_PREVIEW_STYLE = createPreviewStyle({
  ...WUPPERTAL_CONFIG,
  baseMap: { ...WUPPERTAL_CONFIG.baseMap, opacity: 1.0 },
});
