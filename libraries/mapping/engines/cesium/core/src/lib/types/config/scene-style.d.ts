import { TilesetConfig, TilesetStyle } from "./tileset";
import { ImageryProviderConfig, ImageryLayerConfig } from "./imagery";
import { CesiumTerrainProviderConfig } from "./terrain";

export type ColorRgbaArray = [number, number, number, number];

/**
 * Scene Style Configuration
 *
 * RESOURCES vs CONFIGS:
 * - Resources (url only) define WHAT to load
 * - Configs (with options) define HOW to load and style
 * - Multiple styles can use same resource URL with different configs
 * - If configs match (URL + options), we reuse the same Cesium tileset instance
 */

export type SceneStyle = {
  shadows?: boolean; // Per-style shadow control (default: false)
  backgroundColor?: ColorRgbaArray;
  globe?: {
    baseColor: ColorRgbaArray;
  };
  imageryLayers?: Array<ImageryLayerConfig>;
  tilesets?: Array<TilesetStyle>;
  terrain?: CesiumTerrainProviderConfig.id;
};

/**
 * Scene style sources - declare available resources
 * Resources are just URLs + metadata, configs define loading behavior
 */
type SceneStyleConfigSources = {
  imagery?: ImageryProviderConfig[];
  terrain?: CesiumTerrainProviderConfig[];
  tilesets?: TilesetConfig[]; //
  // models?: ModelConfig[]; // TODO: Future - custom models per style
};

export type SceneStyleConfig = {
  id: string;
  name?: string;
  // SOURCES: Declare available resources with required IDs
  sources?: SceneStyleConfigSources;
  // STYLES: Array of visual style variants for these sources
  styles?: Array<SceneStyle>;
};
